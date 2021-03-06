/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import './polyfills';
import {listen} from '../src/event-helper';
import {map} from '../src/types';
import {user} from '../src/log';
import {startsWith} from '../src/string';

export class IframeMessagingClient {

  /**
   *  @param {Window} win A window object.
   */
  constructor(win) {
    /** @private {!Window} */
    this.win_ = win;
    this.hostWindow_ = win.parent;
    /** Map messageType keys to callback functions for when we receive
     *  that message
     *  @private {!Object}
     */
    this.callbackFor_ = map();
    this.setupEventListener_();
  }

  /**
   * Make an event listening request to the host window.
   *
   * @param {string} requestType The type of the request message.
   * @param {string} responseType The type of the response message.
   * @param {function(object)} callback The callback function to call
   *   when a message with type responseType is received.
   */
  makeRequest(requestType, responseType, callback) {
    const unlisten = this.registerCallback(responseType, callback);
    this.sendMessage(requestType);
    return unlisten;
  }

  /**
   * Register callback function for message with type messageType.
   *   As it stands right now, only one callback can exist at a time.
   *   All future calls will overwrite any previously registered
   *   callbacks.
   * @param {string} messageType The type of the message.
   * @param {function()} callback The callback function to call
   *   when a message with type messageType is received.
   */
  registerCallback(messageType, callback) {
    // NOTE : no validation done here. any callback can be register
    // for any callback, and then if that message is received, this
    // class *will execute* that callback
    this.callbackFor_[messageType] = callback;
    return () => { delete this.callbackFor_[messageType]; };
  }

  /**
   *  Send a postMessage to Host Window
   *  @param {string} type The type of message to send.
   *  @param {Object=} opt_payload The payload of message to send.
   */
  sendMessage(type, opt_payload) {
    const message = {type, sentinel: this.sentinel_};
    this.hostWindow_.postMessage/*OK*/(
        Object.assign(message, opt_payload), '*');
  }

  /**
   * Sets up event listener for post messages of the desired type.
   *   The actual implementation only uses a single event listener for all of
   *   the different messages, and simply diverts the message to be handled
   *   by different callbacks.
   *   To add new messages to listen for, call registerCallback with the
   *   messageType to listen for, and the callback function.
   * @private
   */
  setupEventListener_() {
    listen(this.win_, 'message', message => {
      // Does it look a message from AMP?
      if (message.source != this.hostWindow_) {
        return;
      }
      if (!message.data) {
        return;
      }
      if (!startsWith(String(message.data), 'amp-')) {
        return;
      }

      // See if we can parse the payload.
      try {
        const payload = JSON.parse(message.data.substring(4));
        // Check the sentinel as well.
        if (payload.sentinel == this.sentinel_ &&
            this.callbackFor_[payload.type]) {
          try {
            // We should probably report exceptions within callback
            const callback = this.callbackFor_[payload.type];
            callback(payload);
          } catch (err) {
            user().error(
                'IFRAME-MSG',
                `- Error in registered callback ${payload.type}`,
                err);
          }
        }
      } catch (e) {
        // JSON parsing failed. Ignore the message.
      }
    });
  }

  setHostWindow(win) {
    this.hostWindow_ = win;
  }

  setSentinel(sentinel) {
    this.sentinel_ = sentinel;
  }
}
