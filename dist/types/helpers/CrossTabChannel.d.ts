export default CrossTabChannel;
/**
 * @class CrossTabChannel
 * A lightweight wrapper around the BroadcastChannel API for sending and receiving messages
 * between browser tabs or contexts under the same origin.
 *
 * This class provides a simple interface to emit data and subscribe to data changes
 * across tabs, making it ideal for syncing state in multi-tab applications.
 */
declare class CrossTabChannel {
    /**
     * Constructs a new CrossTabChannel instance using the specified channel name.
     *
     * @param {string} [channelName='storagefy_channel'] - The name of the BroadcastChannel.
     *                                                     Tabs sharing this name can communicate with each other.
     */
    constructor(channelName?: string);
    channel: BroadcastChannel;
    channelName: string;
    /**
     * Subscribes to incoming messages on the channel.
     * The callback will be called with the message data whenever another tab posts a message.
     *
     * @param {Function} callback - A function that handles incoming message data.
     */
    subscribe(callback: Function): void;
    /**
     * Sends a message to all tabs subscribed to the same channel.
     *
     * @param {*} data - The data to broadcast. Must be serializable.
     */
    emit(data: any): void;
    /**
     * Closes the channel to stop listening for or sending messages.
     * This is useful for cleanup when the channel is no longer needed.
     */
    close(): void;
}
