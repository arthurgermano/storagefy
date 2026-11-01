import { logError, logWarn, logInfo } from "./loggerHelper.js";
import { generateSimpleId } from "misc-helpers";
class CrossTabChannel {
  /**
   * Constructs a new CrossTabChannel instance using the specified channel name.
   *
   * @param {string} [channelName='storagefy_channel'] - The name of the BroadcastChannel.
   *                                                     Tabs sharing this name can communicate with each other.
   */
  constructor(channelName) {
    try {
      if (typeof channelName !== "string") {
        channelName = generateSimpleId("storagefy_channel");
      }
      this.channel = new BroadcastChannel(channelName);
      this.channelName = channelName;
      logInfo(`CrossTabChannel initialized on channel "${channelName}"`);
    } catch (error) {
      logError("Failed to initialize BroadcastChannel:", error);
      throw error;
    }
  }
  // ------------------------------------------------------------------------------------------------
  /**
   * Listens for the messages other tabs post. Every listener gets every message — adapters of several stores can
   * share one channel.
   *
   * @param {(data: any) => void} callback - Called with each message's data; an error it throws is logged.
   * @returns {() => void} Stops this listener.
   */
  subscribe(callback) {
    if (typeof callback !== "function") {
      logWarn("CrossTabChannel.subscribe: Provided callback is not a function.");
      return () => {
      };
    }
    const listener = (event) => {
      try {
        callback(event.data);
      } catch (error) {
        logError("Error in CrossTabChannel subscriber callback:", error);
      }
    };
    this.channel.addEventListener("message", listener);
    return () => {
      this.channel.removeEventListener("message", listener);
    };
  }
  // ------------------------------------------------------------------------------------------------
  /**
   * Sends a message to all tabs subscribed to the same channel.
   *
   * @param {*} data - The data to broadcast. Must be serializable.
   */
  emit(data) {
    try {
      this.channel.postMessage(data);
      logInfo("CrossTabChannel - Emitted message:", data);
    } catch (error) {
      logError("CrossTabChannel.emit: Failed to send message:", error);
    }
  }
  // ------------------------------------------------------------------------------------------------
  /**
   * Closes the channel to stop listening for or sending messages.
   * This is useful for cleanup when the channel is no longer needed.
   */
  close() {
    try {
      this.channel.close();
      logInfo("CrossTabChannel - Channel closed.");
    } catch (error) {
      logError("CrossTabChannel.close: Error closing channel:", error);
    }
  }
}
var CrossTabChannel_default = CrossTabChannel;
export {
  CrossTabChannel_default as default
};
//# sourceMappingURL=CrossTabChannel.js.map