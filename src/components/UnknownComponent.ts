import { StatefulRoom, NetworkedObject, SpawnType, DataState } from "@skeldjs/au-core";
import { BaseDataMessage, BaseRpcMessage, UnknownDataMessage } from "@skeldjs/au-protocol";
import { HazelReader } from "@skeldjs/hazel";

export class UnknownComponent<RoomType extends StatefulRoom> extends NetworkedObject<RoomType> {
    parseData(state: DataState, reader: HazelReader): BaseDataMessage | undefined {
        return undefined;
    }

    async handleData(data: BaseDataMessage): Promise<void> {
        void data;
    }

    createData(state: DataState): BaseDataMessage | undefined {
        return undefined;
    }
    
    parseRemoteCall(rpcTag: number, reader: HazelReader): BaseRpcMessage | undefined {
        return undefined;
    }
    
    async handleRemoteCall(rpc: BaseRpcMessage): Promise<void> {
        void rpc;
    }

    async processFixedUpdate(delta: number): Promise<void> {
        void delta;
    }

    async processAwake(): Promise<void> {
        void 0;
    }
}
