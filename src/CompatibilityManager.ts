import { Version } from "@skeldjs/au-client";

/**
 * The result of comparing a client's game version against the versions that
 * this server supports.
 */
export enum VersionCompareResult {
    /**
     * The client's version is supported by this server.
     */
    Compatible,
    /**
     * The client's version is older than the oldest version supported by this
     * server.
     */
    ClientTooOld,
    /**
     * The client's version is newer than the newest version supported by this
     * server.
     */
    ServerTooOld,
    /**
     * The client's version is within the range of supported versions, but isn't
     * itself supported (i.e. it's an unsupported intermediate version).
     */
    Unknown
}

/**
 * The revision offset that Innersloth's servers use to indicate that the client
 * has disabled server authority and is requesting host authority instead.
 */
export const DisableServerAuthorityFlag = 25;

/**
 * Disconnect messages sent to clients whose game version can't play on this
 * server, or who request host authority when it isn't allowed.
 */
export const DisconnectMessages = {
    VersionClientTooOld:
        "You are playing an old version of Among Us, please update your game to be compatible with this server.",
    VersionServerTooOld:
        "Your game version is too new, please update Waterway or lower your game version.",
    VersionUnsupported:
        "Your client version is unsupported, please update your game and/or Waterway server.",
    HostAuthorityUnsupported:
        "Your client is requesting host authority, which is not enabled on this Waterway server."
};

/**
 * Get whether a version has the disable-server-authority (+25 revision) flag
 * set, which means the client is requesting host authority.
 */
export function hasDisableServerAuthorityFlag(version: Version): boolean {
    return version.revision >= DisableServerAuthorityFlag;
}

/**
 * Normalize a version by stripping all special flags off of it, such as the
 * disable-server-authority flag.
 */
export function normalizeVersion(version: Version): Version {
    return hasDisableServerAuthorityFlag(version)
        ? new Version(version.year, version.month, version.day, version.revision - DisableServerAuthorityFlag)
        : version;
}

/**
 * The default supported versions, grouped by the game versions that are able
 * to play together (i.e. versions within the same group can cross-play).
 *
 * Ported from Impostor's `CompatibilityManager.DefaultSupportedVersions`.
 */
export const DefaultCompatibilityGroups: ReadonlyArray<readonly Version[]> = [
    [
        new Version(2024, 3, 1),   // 2024.6.18
        new Version(2024, 4, 1),   // 2024.8.13
        new Version(2024, 4, 2),   // 2024.9.4
        new Version(2024, 8, 10)   // 2024.10.29
    ],
    [
        new Version(2024, 8, 11)   // 16.0.0 (2025-03-25)
    ],
    [
        new Version(2025, 4, 15)   // 16.0.5 (2025-05-20) & 16.1.0 (2025-06-10)
    ],
    [
        new Version(2025, 7, 15),  // 17.0.0 (2025-09-09)
        new Version(2025, 9, 12),  // 17.0.1 (2025-10-14)
        new Version(2025, 10, 9),  // 17.1   (2025-11-18)
        new Version(2025, 11, 6),  // 17.1.1 (2025-12-03, mobile only)
        new Version(2025, 12, 8),  // 17.1.2 (2025-12-11, mobile only)
        new Version(2025, 11, 5),  // 17.2   (2026-02-17, build 6630)
        new Version(2026, 1, 22),  // 17.2   (2026-02-19, build 6686, hotfix)
        new Version(2026, 2, 2),   // 17.2.2 (2026-03-17, build 6768)
        new Version(2026, 1, 12),  // 17.3   (2026-03-31, build 6803)
        new Version(2026, 3, 17),  // 17.3.1 (2026-04-08, build 6841, mobile only)
        new Version(2026, 3, 18),  // 17.4   (2026-06-05, build 7044, pc only)
        new Version(2026, 4, 23)   // 17.4   (2026-06-05, build 7045, mobile only)
    ],
    [
        new Version(2026, 7, 15),  // 18.0   (2026-08-18, build 7238, pc only)
        new Version(2026, 7, 16)   // 18.0   (2026-08-18, build 7238, mobile only)
    ],
    [
        new Version(2026, 7, 20),  // 19.0   (2026-09-29, build 7489, pc only)
        new Version(2026, 7, 21)   // 19.0   (2026-09-29, build 7492, mobile only)
    ]
];

/**
 * Determines which client game versions can connect to the server, and which
 * versions are able to play together (cross-play compatibility groups).
 *
 * Ported from Impostor's `CompatibilityManager`.
 */
export class CompatibilityManager {
    protected compatibilityGroups: Version[][] = [];
    protected supportMap: Map<number, Version[]> = new Map;
    protected lowestVersionSupported = Number.MAX_SAFE_INTEGER;
    protected highestVersionSupported = 0;

    constructor(compatibilityGroups: ReadonlyArray<readonly Version[]> = DefaultCompatibilityGroups) {
        for (const compatibilityGroup of compatibilityGroups) {
            this.addCompatibilityGroup(compatibilityGroup);
        }
    }

    getSupportedGroups(): ReadonlyArray<readonly Version[]> {
        return this.compatibilityGroups;
    }

    /**
     * Try to find the compatibility group that a client version belongs to.
     * @param clientVersion The client's game version.
     */
    tryGetCompatibilityGroup(clientVersion: Version): Version[] | undefined {
        return this.supportMap.get(normalizeVersion(clientVersion).toEncoded());
    }

    /**
     * Compare a client's game version against the versions supported by this
     * server.
     * @param clientVersion The client's game version.
     */
    canConnectToServer(clientVersion: Version): VersionCompareResult {
        if (this.tryGetCompatibilityGroup(clientVersion)) {
            return VersionCompareResult.Compatible;
        }

        const normalized = normalizeVersion(clientVersion).toEncoded();

        if (normalized < this.lowestVersionSupported) {
            return VersionCompareResult.ClientTooOld;
        }

        if (normalized > this.highestVersionSupported) {
            return VersionCompareResult.ServerTooOld;
        }

        return VersionCompareResult.Unknown;
    }

    protected addCompatibilityGroup(compatibilityGroup: readonly Version[]) {
        const group = [...compatibilityGroup];

        for (const gameVersion of group) {
            const encoded = normalizeVersion(gameVersion).toEncoded();
            if (this.supportMap.has(encoded)) {
                throw new Error("Can't add this compatibility group because one of its versions ("
                    + gameVersion.toString() + ") is already added");
            }
        }

        this.compatibilityGroups.push(group);

        for (const gameVersion of group) {
            this.addSupportedVersion(group, gameVersion);
        }
    }

    protected addSupportedVersion(group: Version[], gameVersion: Version) {
        const encoded = normalizeVersion(gameVersion).toEncoded();

        if (this.supportMap.has(encoded)) {
            throw new Error("Can't add this game version because it's already in another compatibility group");
        }

        this.supportMap.set(encoded, group);

        if (encoded < this.lowestVersionSupported) {
            this.lowestVersionSupported = encoded;
        }

        if (encoded > this.highestVersionSupported) {
            this.highestVersionSupported = encoded;
        }
    }
}
