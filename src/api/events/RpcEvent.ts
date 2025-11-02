import { BaseRpcMessage } from "@skeldjs/au-protocol";

export interface RpcEvent {
    /**
     * The rpc message for this event.
     */
    rpc: BaseRpcMessage;
}
