import { EndGameIntent, GameOverReason } from "@skeldjs/au-core";
import { BasicEvent, CancelableEvent } from "@skeldjs/events";
import { Room } from "../../../Room";

export class RoomGameEndEvent extends BasicEvent implements CancelableEvent {
    static eventName = "room.gameend" as const;
    eventName = "room.gameend" as const;

    canceled: boolean;

    constructor(
        public readonly room: Room,
        public readonly reason: GameOverReason,
        public readonly intent?: EndGameIntent
    ) {
        super();

        this.canceled = false;
    }

    cancel(): void {
        this.canceled = true;
    }
}
