import { logError, logWarn, logInfo } from "./loggerHelper.js";
import generateSimpleId from "misc-helpers/src/utils/generateSimpleId.js";

// ------------------------------------------------------------------------------------------------

/**
 * @class CrossTabChannel
 * A lightweight wrapper around the BroadcastChannel API for sending and receiving messages
 * between browser tabs or contexts under the same origin.
 *
 * This class provides a simple interface to emit data and subscribe to data changes
 * across tabs, making it ideal for syncing state in multi-tab applications.
 */
class CrossTabChannel {
  /**
   * Constructs a new CrossTabChannel instance using the specified channel name.
   *
   * @param {string} [channelName='storagefy_channel'] - The name of the BroadcastChannel.
   *                                                     Tabs sharing this name can communicate with each other.
   */
  constructor(channelName) {
    // Initialize the BroadcastChannel with the given name.
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
   * Subscribes to incoming messages on the channel.
   * The callback will be called with the message data whenever another tab posts a message.
   *
   * @param {Function} callback - A function that handles incoming message data.
   */
  subscribe(callback) {
    if (typeof callback !== "function") {
      logWarn("CrossTabChannel.subscribe: Provided callback is not a function.");
      return;
    }

    this.channel.onmessage = (event) => {
      logInfo("CrossTabChannel - Received message:", event.data);
      try {
        callback(event.data);
      } catch (error) {
        logError("Error in CrossTabChannel subscriber callback:", error);
      }
    };

    logInfo("CrossTabChannel - Subscribed to incoming messages.");
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

// ------------------------------------------------------------------------------------------------

export default CrossTabChannel;

// ------------------------------------------------------------------------------------------------
