const initialReconnectTimeout = 500;
const reconnectTimeCeiling = 8000;

class EulerToolClient {
  constructor(opts) {
    this.opts = opts;

    if (!this.opts.version) throw `must provide version to EulerToolClient`;

    this.nextId = 1;
    this.cbs = {};
    this.timeoutHandles = {};
    this.subs = {};
    this.pendingMessagesToSend = [];
    this.reconnectTimeout = initialReconnectTimeout;

    this.heartBeatInterval = setInterval(() => {
      if (this.ws === undefined || this.ws.readyState !== 1) return;
      this.send('ping', {}, () => {});
    }, this.opts.pingFreqMilliseconds || 55000);
  }

  connect() {
    if (this.ws) {
      this.ws.close();
    }
    this.ws = new this.opts.WebSocket(this.opts.endpoint);

    this.ws.onopen = () => {
      this.reconnectTimeout = initialReconnectTimeout;

      this.send(
        'hello',
        { version: this.opts.version },
        (err, helloResponse) => {
          if (err) {
            console.error('Connection error: ', err);
            return;
          }

          if (this.opts.onConnect) this.opts.onConnect(helloResponse);
        }
      );

      for (let msg of this.pendingMessagesToSend) {
        this.ws.send(msg);
      }

      this.pendingMessagesToSend = [];

      for (let subId of Object.keys(this.subs)) {
        this.send('sub', this.subs[subId], this.cbs[subId], subId);
      }
    };

    this.ws.onmessage = (msgStr) => {
      let msg = JSON.parse(msgStr.data);

      let cb = this.cbs[msg.id];
      if (!cb) return; // probably already unsubscribed

      if (msg.fin) this.clearId(msg.id);

      cb(null, msg);
    };

    this.ws.onclose = () => {
      if (this.shuttingDown) return;
      this.ws = undefined;

      if (this.timeoutWatcher) {
        clearTimeout(this.timeoutWatcher);
      }
      this.timeoutWatcher = setTimeout(
        () => this.connect(),
        this.reconnectTimeout
      );

      this.reconnectTimeout *= 2;
      if (this.reconnectTimeout > reconnectTimeCeiling)
        this.reconnectTimeout = reconnectTimeCeiling;

      if (this.opts.onDisconnect) this.opts.onDisconnect(this);
    };

    this.ws.onerror = (e) => {
      let ws = this.ws;
      delete this.ws;
      ws.close();
    };
  }

  send(cmd, body, cb, idOverride, timeout) {
    let id = idOverride || this.nextId++;

    let msg = JSON.stringify({ id: parseInt(id), cmd, ...body });

    if (cb) {
      this.cbs[id] = cb;
      if (timeout) {
        this.timeoutHandles[id] = setTimeout(() => {
          this.clearId(id);
          cb(`timeout after ${timeout}ms`, null);
        }, timeout);
      }
    }

    if (this.ws === undefined || this.ws.readyState !== 1) {
      if (cmd !== 'sub' && cmd !== 'unsub')
        this.pendingMessagesToSend.push(msg);
    } else {
      this.ws.send(msg);
    }

    return id;
  }

  async sendAsync(cmd, body, timeout) {
    if (!timeout) timeout = 5000;

    let response = await new Promise((resolve, reject) => {
      let subId;
      subId = this.send(
        cmd,
        body,
        (err, result) => {
          if (cmd === 'sub' && subId !== undefined) this.unsubscribe(subId);
          if (err) reject(err);
          else resolve(result);
        },
        undefined,
        timeout
      );
    });

    return response;
  }

  sub(sub, cb) {
    let id = this.send('sub', sub, cb);
    this.subs[id] = sub;
    return id;
  }

  unsubscribe(id) {
    let msg = JSON.stringify({ id: parseInt(id), cmd: 'unsub' });

    if (this.ws !== undefined && this.ws.readyState === 1) {
      this.ws.send(msg);
    }

    this.clearId(id);
  }

  clearId(id) {
    delete this.cbs[id];
    if (this.timeoutHandles[id]) {
      clearTimeout(this.timeoutHandles[id]);
      delete this.timeoutHandles[id];
    }
    delete this.subs[id];
  }

  shutdown() {
    this.shuttingDown = true;
    if (this.ws) this.ws.close();
    this.ws = undefined;
    if (this.heartBeatInterval) clearInterval(this.heartBeatInterval);
    this.heartBeatInterval = undefined;
  }
}

module.exports = EulerToolClient;
