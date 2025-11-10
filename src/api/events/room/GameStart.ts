import { BasicEvent, CancelableEvent } from "@skeldjs/events";
import { Player } from "@skeldjs/au-core";

import { Room } from "../../../Room";

export class RoomGameStartEvent extends BasicEvent implements CancelableEvent {
    static eventName = "room.gamestart" as const;
    eventName = "room.gamestart" as const;

    canceled: boolean;

    constructor(
        public readonly room: Room,
        public readonly startedByPlayer: Player<Room>|undefined,
    ) {
        super();
        this.canceled = false;
    }

    cancel(): void {
        this.canceled = true;
    }
}
