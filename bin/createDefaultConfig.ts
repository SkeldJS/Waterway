import { Hat, Skin, Visor } from "@skeldjs/au-core";
import { WaterwayConfig } from "../src";

export function createDefaultConfig(): WaterwayConfig {
    return {
        clusterName: "Capybara",
        nodeId: 0,
        checkForUpdates: true,
        autoUpdate: false,
        exitConfirmation: true,
        defaultLanguage: "en",
        acceptedVersions: [],
        matchmaker: {
            port: 22023
        },
        account: {
            enabled: true,
            gameCodeLifetimeSeconds: 180,
            sessionLifetimeMinutes: 30,
            rejectUnmatched: false,
            resolveFriendCode: true,
            friendCodeEndpoint: "https://backend.innersloth.com/api/user/username",
            friendCodeCacheMinutes: 30,
            friendCodeTimeoutSeconds: 5
        },
        socket: {
            port: 22123,
            additionalPorts: [],
            acceptUnknownGameData: false,
            messageOrdering: false,
            ip: "auto",
            useDtlsLayout: false
        },
        gameListing: {
            ignorePrivacy: false,
            ignoreSearchTerms: false,
            maxResults: 10,
            removeExtraFilters: false,
            requireExactMatches: true
        },
        plugins: {
            loadDirectory: true
        },
        logging: {
            hideSensitiveInfo: false,
            playerColors: true,
            connections: {
                format: ["id", "ip", "ping", "room"]
            },
            rooms: {
                format: ["players", "map", "host", "privacy"]
            },
            players: {
                format: ["id", "ping", "ishost"]
            }
        },
        rooms: {
            checkChatMode: false,
            chatCommands: true,
            plugins: {
                loadDirectory: true
            },
            gameCodes: "v2",
            enforceSettings: {},
            authoritativeServer: false,
            allowHostAuthority: false,
            advanced: {
                unknownObjects: false
            },
            serverPlayer: {
                name: "<color=yellow>[Server]</color>",
                color: "Yellow",
                hat: Hat.NoHat,
                skin: Skin.None,
                visor: Visor.EmptyVisor
            },
            createTimeout: 10
        },
        optimizations: {
            movement: {
                reuseBuffer: true,
                updateRate: 1,
                visionChecks: false,
                deadChecks: true
            },
            disablePerspectives: false
        }
    };
}
