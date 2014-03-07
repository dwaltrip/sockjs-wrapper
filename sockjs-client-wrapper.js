var SockjsClient = function(sockjs_url, options) {
    if (typeof(options) == 'undefined') options = {}
    this.protocol = null;
    this.id = null;

    var sockjs = new SockJS(sockjs_url);
    var client_events = new EventEmitter();
    var pending_data = [];
    var verbose = options.verbose || false;
    var that = this;

    // --------------
    // public methods
    // --------------

    this.on = function(event_name, cb) {
        // only inform server that a client is listening for custom events
        if (['connect', 'message', 'close', 'error'].indexOf(event_name) < 0) {
            this.send({ type: 'subscription', event_name: event_name });
        }
        client_events.on(event_name, cb);
    };

    this.send = function(data) {
        // if we JSON.stringify everything, then on server side we simply JSON.parse everything
        write_to_server(JSON.stringify(data));
    };

    this.emit = function(event_name, data) {
        write_to_server(JSON.stringify({
            type: 'message',
            event_name: event_name,
            data: data
        }));
    };

    // ---------------
    // private methods
    // ---------------

    var init = function() {
        client_events.on('send_pending_data', function() {
            if (pending_data.length > 0) {
                log('-- send_pending_data event -- number pending: ' + pending_data.length);
                for(var i = 0; i < pending_data.length; i++) {
                    write_to_server(pending_data[i]);
                }
                pending_data = [];
            }
        });

        client_events.on('update_socket_attributes', function() {
            update_socket_attributes(that, { protocol: sockjs.protocol });
        });

        sockjs.onopen = function() {
            log("SockJS connection open using '" + sockjs.protocol + "'");

            client_events.emit('update_socket_attributes');
            client_events.emit('connect');
            client_events.emit('send_pending_data');
        };

        // e.data is already stringified by server before sending (also, e has a nice toString);
        sockjs.onmessage = function(e) {
            log('     onmessage, e: ' + e);

            if (e.type === 'message') {
                log(e.data);
                var data = JSON.parse(e.data);

                if (typeof data === 'object' && has_key(data, 'event_name')) {
                    log('-- client_events.emit -- event_name: ' + data.event_name);
                    client_events.emit(data.event_name, data.data);
                }
                else {
                    log('-- client_events.emit \'message\' --');
                    client_events.emit('message', data);
                }
            } else {
                log('Non-message type event from server. e: ' + JSON.stringify(e)); }
        };

        sockjs.onclose = function(e) {
            log("SockJS connection closed. protocol: '" + JSON.stringify(sockjs.protocol) + "'");
            client_events.emit('close', e.code, e.reason);
        };

        sockjs.onerror = function(err) {
            log('SockJS connection error occurred. msg:' + JSON.stringify(err));
            client_events.emit('error', err);
        };
    };


    var write_to_server = function(prepped_data) {
        if (sockjs.readyState == SockJS.CONNECTING) {
            log('-- write_to_server -- adding to PENDING_DATA. prepped_data: ' + prepped_data);
            pending_data.push(prepped_data);
        }
        else {
            log('-- write_to_server -- good to go. prepped_data: ' + prepped_data);
            sockjs.send(prepped_data);
        }
    };

    var update_socket_attributes = function(that, attr_hash) {
        for(var attr in attr_hash) {
            var log_msg = "that[" + JSON.stringify(attr) + "] = " + JSON.stringify(that[attr]);
            log_msg += ", attr_hash[" + JSON.stringify(attr) + "] = " + JSON.stringify(attr_hash[attr]);
            log("-- update_socket_attributes -- " + log_msg)
            that[attr] = attr_hash[attr];
        }
    };

    var log = function(log_message) {
        if (verbose) {
            console.log(log_message);
        }
    };

    init();
};

var has_key = function(obj, key) {
    return Object.hasOwnProperty.call(obj, key);
};
