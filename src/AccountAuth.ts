import * as chalk from "chalk";
import * as crypto from "crypto";

import { Language } from "@skeldjs/au-core";
import { RoomCode, RoomCodeVersion } from "@skeldjs/au-client";

import { Logger } from "./Logger";
import { WaterwayServer } from "./WaterwayServer";

export type AccountConfig = {
    /**
     * Whether puid/friend code binding through temporary game codes is active.
     * @default true
     */
    enabled: boolean;
    /**
     * How long an issued temporary game code stays valid, in seconds.
     * @default 180
     */
    gameCodeLifetimeSeconds: number;
    /**
     * How long a token session is kept, in minutes.
     * @default 30
     */
    sessionLifetimeMinutes: number;
    /**
     * Whether players that could not be bound to an account are disconnected.
     * @default false
     */
    rejectUnmatched: boolean;
    /**
     * Whether friend codes are fetched from the backend when a token is requested.
     * @default true
     */
    resolveFriendCode: boolean;
    /**
     * The endpoint that returns the friend code of the token owner.
     * The player's login token is sent to it, so only point it at a backend you trust.
     * @default "https://backend.innersloth.com/api/user/username"
     */
    friendCodeEndpoint: string;
    /**
     * How long a fetched friend code is cached, in minutes.
     * @default 30
     */
    friendCodeCacheMinutes: number;
    /**
     * The timeout of the friend code request, in seconds.
     * @default 5
     */
    friendCodeTimeoutSeconds: number;
}

export type AccountSession = {
    id: string;
    puid: string;
    friendCode: string|undefined;
    name: string;
    clientVersion: number;
    language: Language;
    expiresAt: number;
}

export type AccountClaim = {
    puid: string;
    friendCode: string|undefined;
    target: number;
    alias: number;
}

export type AccountClaimResult = {
    claim: AccountClaim|null;
    conflict: boolean;
}

export const AccountDisconnectMessages = {
    AccountUnmatched: "Your account could not be verified. Please try joining again.",
    AuthenticationFailedRetry: "Authentication failed, please retry.",
};

const hostWaitingKey = 0;

type Ticket = {
    session: AccountSession;
    target: number;
    expiresAt: number;
}

/**
 * Binds the http token session to the udp connection without looking at addresses.
 * Joiners get a one-off alias code in the listing, which comes back in the join packet.
 * Hosts (and joins that only know the real code) are matched by name, language and version.
 */
export class AccountAuthManager {
    logger: Logger;

    enabled: boolean;
    rejectUnmatched: boolean;

    codeLifetimeMs: number;
    sessionLifetimeMs: number;
    hostLifetimeMs: number;

    sessions: Map<string, AccountSession>;
    aliases: Map<number, Ticket>;
    aliasOwners: Map<string, number>;
    waiting: Map<number, Ticket[]>;

    friendCodes: FriendCodeResolver;

    sweeper: NodeJS.Timeout;

    constructor(server: WaterwayServer, config?: Partial<AccountConfig>) {
        this.logger = new Logger(chalk.magenta("Account"), server.vorpal);

        this.enabled = config?.enabled ?? true;
        this.rejectUnmatched = config?.rejectUnmatched ?? false;

        const gameCodeLifetimeSeconds = Math.max(5, config?.gameCodeLifetimeSeconds ?? 180);
        this.codeLifetimeMs = gameCodeLifetimeSeconds * 1000;
        this.sessionLifetimeMs = Math.max(1, config?.sessionLifetimeMinutes ?? 30) * 60000;
        this.hostLifetimeMs = Math.min(gameCodeLifetimeSeconds, 30) * 1000;

        this.sessions = new Map;
        this.aliases = new Map;
        this.aliasOwners = new Map;
        this.waiting = new Map;

        this.friendCodes = new FriendCodeResolver({
            resolveFriendCode: config?.resolveFriendCode ?? true,
            friendCodeEndpoint: config?.friendCodeEndpoint ?? "https://backend.innersloth.com/api/user/username",
            friendCodeCacheMinutes: Math.max(1, config?.friendCodeCacheMinutes ?? 30),
            friendCodeTimeoutSeconds: Math.max(1, config?.friendCodeTimeoutSeconds ?? 5),
        }, this.logger);

        this.sweeper = setInterval(() => this.sweep(), 30000);
        this.sweeper.unref();
    }

    createSession(puid: string, friendCode: string|undefined, name: string, clientVersion: number, language: Language): string {
        const id = crypto.randomBytes(16).toString("hex");
        this.sessions.set(id, {
            id,
            puid,
            friendCode,
            name,
            clientVersion,
            language,
            expiresAt: Date.now() + this.sessionLifetimeMs
        });
        return id;
    }

    getSession(id: string|undefined): AccountSession|null {
        if (!id)
            return null;

        const session = this.sessions.get(id);
        if (!session)
            return null;

        if (session.expiresAt <= Date.now())
            return null;

        return session;
    }

    isAlias(code: number) {
        return this.aliases.has(code);
    }

    // Returns the code the client should use to join `target`.
    issueAlias(session: AccountSession, target: number, inUse: (code: number) => boolean): number {
        const now = Date.now();
        const owner = session.id + ":" + target;

        const current = this.aliasOwners.get(owner);
        if (current !== undefined) {
            const live = this.aliases.get(current);
            if (live && live.expiresAt > now)
                return current;
        }

        for (let i = 0; i < 16; i++) {
            const code = RoomCode.generateRandom(RoomCodeVersion.V2).id;
            if (inUse(code) || this.aliases.has(code))
                continue;

            this.aliases.set(code, { session, target, expiresAt: now + this.codeLifetimeMs });
            this.aliasOwners.set(owner, code);
            return code;
        }

        // No free alias, fall back to name matching on the real code.
        this.logger.warn("Could not find a free temporary game code for %s (%s) and game %s, falling back to name matching",
            session.name, session.puid, new RoomCode(target));
        this.expectJoin(session, target);
        return target;
    }

    expectHost(session: AccountSession) {
        this.enqueue(hostWaitingKey, session, hostWaitingKey, this.hostLifetimeMs);
    }

    expectJoin(session: AccountSession, target: number) {
        this.enqueue(target, session, target);
    }

    claimHost(name: string, language: Language, clientVersion: number): AccountClaimResult {
        return this.claimWaiting(hostWaitingKey, name, language, clientVersion);
    }

    claimJoin(code: number, name: string, language: Language, clientVersion: number): AccountClaimResult {
        const ticket = this.aliases.get(code);
        if (ticket) {
            this.aliases.delete(code);
            this.aliasOwners.delete(ticket.session.id + ":" + ticket.target);

            if (ticket.expiresAt <= Date.now()) {
                this.logger.warn("Temporary game code %s (%s) used by %s had already expired",
                    new RoomCode(code), code, name);
                return { claim: null, conflict: false };
            }

            return {
                claim: {
                    puid: ticket.session.puid,
                    friendCode: ticket.session.friendCode,
                    target: ticket.target,
                    alias: code
                },
                conflict: false
            };
        }

        return this.claimWaiting(code, name, language, clientVersion);
    }

    // Swaps a temporary code for the real one on an already bound connection.
    tryResolveAlias(code: number, puid: string): number|null {
        const ticket = this.aliases.get(code);
        if (!ticket)
            return null;

        this.aliases.delete(code);
        this.aliasOwners.delete(ticket.session.id + ":" + ticket.target);

        if (ticket.expiresAt <= Date.now()) {
            this.logger.warn("Temporary game code %s (%s) had already expired",
                new RoomCode(code), code);
            return null;
        }

        if (ticket.session.puid !== puid) {
            this.logger.warn("Temporary game code %s (%s) belongs to another account, not handing it over",
                new RoomCode(code), code);
            return null;
        }

        return ticket.target;
    }

    destroy() {
        clearInterval(this.sweeper);
    }

    protected enqueue(key: number, session: AccountSession, target: number, lifetimeMs = this.codeLifetimeMs) {
        let list = this.waiting.get(key);
        if (!list) {
            list = [];
            this.waiting.set(key, list);
        }

        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].session.id === session.id)
                list.splice(i, 1);
        }

        list.push({ session, target, expiresAt: Date.now() + lifetimeMs });
    }

    protected claimWaiting(key: number, name: string, language: Language, clientVersion: number): AccountClaimResult {
        const list = this.waiting.get(key);
        if (!list)
            return { claim: null, conflict: false };

        const now = Date.now();
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].expiresAt <= now)
                list.splice(i, 1);
        }

        let best = -1;
        let bestScore = -1;
        let ambiguous = false;

        for (let i = 0; i < list.length; i++) {
            const session = list[i].session;
            if (session.name !== name)
                continue;

            const score = (session.language === language ? 2 : 0) + (session.clientVersion === clientVersion ? 1 : 0);
            if (score > bestScore) {
                best = i;
                bestScore = score;
                ambiguous = false;
            } else if (score === bestScore) {
                ambiguous = true;
            }
        }

        if (ambiguous) {
            let pendingPuid: string|undefined;
            let sameAccount: AccountClaim|null = null;
            let conflict = false;
            const tied: number[] = [];

            for (let i = 0; i < list.length; i++) {
                const session = list[i].session;
                if (session.name !== name)
                    continue;

                const score = (session.language === language ? 2 : 0) + (session.clientVersion === clientVersion ? 1 : 0);
                if (score !== bestScore)
                    continue;

                tied.push(i);

                if (tied.length === 1) {
                    pendingPuid = session.puid;
                    sameAccount = { puid: session.puid, friendCode: session.friendCode, target: list[i].target, alias: 0 };
                } else if (pendingPuid !== session.puid) {
                    conflict = true;
                }
            }

            if (!conflict) {
                // Same player requested a token several times, keep a single ticket.
                for (let i = tied.length - 1; i >= 0; i--)
                    list.splice(tied[i], 1);

                return { claim: sameAccount, conflict: false };
            }

            // Different players share this name, both have to retry shortly.
            const retryAt = now + 3000;
            for (const i of tied)
                list[i] = { session: list[i].session, target: list[i].target, expiresAt: retryAt };

            return { claim: null, conflict: true };
        }

        if (best < 0)
            return { claim: null, conflict: false };

        const hit = list.splice(best, 1)[0];
        return {
            claim: { puid: hit.session.puid, friendCode: hit.session.friendCode, target: hit.target, alias: 0 },
            conflict: false
        };
    }

    protected sweep() {
        try {
            const now = Date.now();

            for (const [id, session] of this.sessions) {
                if (session.expiresAt <= now)
                    this.sessions.delete(id);
            }

            for (const [code, ticket] of this.aliases) {
                if (ticket.expiresAt <= now) {
                    this.aliases.delete(code);
                    this.aliasOwners.delete(ticket.session.id + ":" + ticket.target);
                }
            }

            for (const [, list] of this.waiting) {
                for (let i = list.length - 1; i >= 0; i--) {
                    if (list[i].expiresAt <= now)
                        list.splice(i, 1);
                }
            }
        } catch (e) {
            this.logger.warn("Account cache sweep failed: %s", (e as Error).message);
        }
    }
}

export type FriendCodeConfig = Pick<AccountConfig,
    "resolveFriendCode" | "friendCodeEndpoint" | "friendCodeCacheMinutes" | "friendCodeTimeoutSeconds">;

/**
 * Fetches the friend code (username#discriminator) of the token owner from the
 * Innersloth backend, so it can be bound alongside the puid.
 */
export class FriendCodeResolver {
    cache: Map<string, { code: string; expires: number }>;

    constructor(protected readonly config: FriendCodeConfig, protected readonly logger: Logger) {
        this.cache = new Map;
    }

    async resolve(puid: string, bearerToken: string|undefined): Promise<string|undefined> {
        if (!this.config.resolveFriendCode)
            return undefined;

        if (!bearerToken)
            return undefined;

        const cached = this.cache.get(puid);
        if (cached && cached.expires > Date.now())
            return cached.code;

        // The backend answers for the token owner, so it must match the claimed puid.
        if (!this.tokenBelongsTo(bearerToken, puid)) {
            this.logger.warn("Token does not belong to %s, friend code skipped", puid);
            return undefined;
        }

        try {
            const response = await fetch(this.config.friendCodeEndpoint, {
                headers: {
                    "Authorization": "Bearer " + bearerToken,
                    "Accept": "application/vnd.api+json"
                },
                signal: AbortSignal.timeout(Math.max(1, this.config.friendCodeTimeoutSeconds) * 1000)
            });

            if (!response.ok) {
                this.logger.warn("Friend code request for %s returned %s", puid, response.status);
                return undefined;
            }

            const code = this.parseFriendCode(await response.text());
            if (!code) {
                this.logger.warn("Friend code response for %s had no username", puid);
                return undefined;
            }

            this.remember(puid, code);
            return code;
        } catch (e) {
            this.logger.warn("Friend code request for %s failed: %s", puid, (e as Error).message);
            return undefined;
        }
    }

    // The login token is a jwt; it must belong to the same account we are binding.
    protected tokenBelongsTo(token: string, puid: string) {
        const parts = token.split(".");
        if (parts.length < 2)
            return false;

        let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (payload.length % 4) payload += "=";

        try {
            const claims = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
            return claims["sub"] === puid || claims["puid"] === puid;
        } catch {
            return false;
        }
    }

    protected parseFriendCode(json: string): string|undefined {
        let node: unknown;
        try {
            node = JSON.parse(json);
        } catch {
            return undefined;
        }

        node = this.getProperty(node, "data") ?? node;
        node = this.getProperty(node, "attributes") ?? node;

        const username = this.getProperty(node, "username");
        const discriminator = this.getProperty(node, "discriminator");

        if (typeof username !== "string" || typeof discriminator !== "string")
            return undefined;

        return username && discriminator ? username + "#" + discriminator : undefined;
    }

    protected getProperty(obj: unknown, name: string): unknown {
        if (!obj || typeof obj !== "object")
            return undefined;

        for (const key of Object.keys(obj)) {
            if (key.toLowerCase() === name.toLowerCase())
                return (obj as Record<string, unknown>)[key];
        }
        return undefined;
    }

    protected remember(puid: string, code: string) {
        const now = Date.now();

        if (this.cache.size > 5000) {
            for (const [key, entry] of this.cache) {
                if (entry.expires <= now)
                    this.cache.delete(key);
            }
        }

        this.cache.set(puid, { code, expires: now + Math.max(1, this.config.friendCodeCacheMinutes) * 60000 });
    }
}
