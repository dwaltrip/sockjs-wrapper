var EventEmitter = require('events').EventEmitter;

var utils = require('./utils');
var fmt_log = utils.fmt_log;
var has_key = utils.has_key;

// convenient wrapper object for the sockjs Server
// provides custom events, client connection partitioning into named rooms
// by passing a wrapped sockjs socket object to the 'connection' event callback provided by the user
// as well as some other useful functionality
var SockjsServer = function(http_server, options) {
    var prefix = options['prefix'] || '/';
    var sockjs_url = options['sockjs_url'] || "http://cdn.sockjs.org/sockjs-0.3.min.js";
    var verbose = options.verbose || false;

    var sockjs = require('sockjs').createServer({
        sockjs_url: sockjs_url
    })
    sockjs.installHandlers(http_server, { prefix: prefix });

    var connection_events = new EventEmitter();
    var clients = {}
    var rooms = {};
    var that = this;

    sockjs.on('connection', function(sockjs_connection) {
        log('New client connected with id: ' + sockjs_connection.id, true);

        var socket = new SocketWrapper(sockjs_connection, that);
        clients[socket.id] = socket;

        // SockjsClient already calls JSON.stringify any data before sending, if necessary
        sockjs_connection.on('data', function(data) {
            log("Received client data: " + data, true);
            if (typeof data === 'object') {
                log("'data' obj keys: " + Object.keys(data), true);
            }

            socket.handle(data);
        });

        sockjs_connection.on('close', function() {
            log('Connection closed for socket id: ' + sockjs_connection.id, true);

            socket.handle({ type: 'close' });
            remove_client(socket.id);
        });

        // call the user's 'connection' event callback(s), passing our wrapped socket object
        connection_events.emit('connection', socket);
    });


    this.on = function(event_name, cb) {
        // sockjs Server objects only emits the event 'connection'
        if(event_name === 'connection') {
            // the function object passed here to sockjs 'connection' is the actual callback
            // that occurs each time a new client connects (as the underlying sockjs server emits 'connection')

            connection_events.on('connection', cb);
        }
    };

    this.write_all = function(data) {
        log('SockjsServer.write_all -- data: ' + JSON.stringify(data), true);

        for(var client_id in clients) {
            clients[client_id].write(data);
        }
    };

    this.emit = function(event_name, data) {
        log('SockjsServer.emit -- event_name: ' + event_name + ', data: ' + JSON.stringify(data), true, true);

        for(var client_id in clients) {
            clients[client_id].emit(event_name, data);
        }
    };

    this.rooms = function(room_name) {
        var room_manager = new (function(room_name) {
            var _room_name = room_name;

            this.emit = function(event_name, data, options) {
                var skip_list_array = options.skip || [];
                var skip_list = {};
                for(var i = 0; i < skip_list_array.length; i++)
                    skip_list[skip_list_array[i]] = true;

                for(var client_id in rooms[_room_name]) {
                    if (!has_key(skip_list, client_id)) {
                        log("rooms.emit -- sending '" + event_name + "' to client: " + client_id, false, false, true);
                        clients[client_id].emit(event_name, data);
                    }
                    else {
                        log("rooms.emit -- SKIPPED '" + event_name + "' for client: " + client_id, false, false, true);
                    }
                }
            };

            this.write = function(data) {
                for(var client_id in rooms[_room_name]) {
                    clients[client_id].write(data);
                }
            };
        })(room_name);

        return room_manager;
    };

    this._add_client_to_room = function(room_name, socket_id) {
        if(!has_key(rooms, room_name)) {
            add_room(room_name);
        }
        // true value has no meaning here, we are simply using hashes for faster lookup/delete
        // silly javascript has no built in set data type
        rooms[room_name][socket_id] = true;
    };

    this._remove_client_from_room = function(room_name, socket_id) {
        if(!has_key(rooms, room_name) || !has_key(rooms[room_name], socket_id))
            return false;

        delete rooms[room_name][socket_id];

        // if room now has no clients, then delete room
        if (Object.keys(rooms[room_name]).length == 0)
            delete rooms[room_name];

        return true;
    };

    this.log = function() {
        log.apply(that, arguments);
    }

    var log = function() {
        if (verbose) {
            fmt_log.apply(that, arguments);
        }
    }

    var add_room = function(room_name) {
        rooms[room_name] = {};
    };

    var remove_client = function(client_id) {
        for(var room_name in clients[client_id].rooms) {
            that._remove_client_from_room(room_name, client_id)
            //delete rooms[room_name][client_id];
        }
        delete clients[client_id];
    };
};

var SocketWrapper = function(sockjs_connection, sockjs_server) {
    this.socket = sockjs_connection;
    this.id = this.socket.id;
    this.server = sockjs_server;
    this.rooms = {};

    var that = this;
    var event_emitter = new EventEmitter();

    this.handle = function(raw_data) {
        var data = (typeof raw_data === 'string') ? JSON.parse(raw_data) : raw_data;
        var data_keys_str = null;
        if (has_key(data, 'data')) data_keys_str = "data['data'].keys: " + JSON.stringify(Object.keys(data.data));
        log('SocketWrapper.handle -- id: ' + that.id + ", " + data_keys_str, true);

        if (data.type == 'message') {
            if (has_key(data, 'event_name')) {
                event_emitter.emit(data.event_name, data.data);
            }
            else {
                event_emitter.emit('message', data.data);
            }
        }
        else {
            if (has_key(data, 'args')) {
                data.args.unshift(data.type);
                event_emitter.emit.apply(this, data.args);
            }
        }

        // we could handle subscription data in here, and then for custom events we would only
        // have to message clients that are already listening on that custom event
    };

    this.on = function(event_name, cb) {
        log('SocketWrapper.on, setting callbacks -- event_name: ' + JSON.stringify(event_name), true);
        log('cb:' + cb.toString().split('\n')[0], false, false, true);
        event_emitter.on(event_name, cb);
    };

    // 'write' is the same as 'emit', goes straight to the client 'message' listener
    this.write = function(data) {
        that.socket.write(JSON.stringify({
            event_name: 'message',
            data: data
        }));
    };

    // 'emit' is the as 'write', but is only seen by clients listening to custom event '[event_name]'
    this.emit = function(event_name, data) {
        // maybe output some error here if they try to use any reserved event names
        that.socket.write(JSON.stringify({
            event_name: event_name,
            data: data
        }));
    };

    this.join = function(room_name) {
        log('SocketWrapper.join -- room_name: ' + room_name, true);
        that.server._add_client_to_room(room_name, that.id);
        that.rooms[room_name] = true;
    };

    this.leave = function(room_name) {
        if(that.server._remove_client_from_room(room_name, that.id)) {
            delete that.rooms[room_name];
            return true;
        }
        return false;
    };

    var log = function() {
        that.server.log.apply(that.server, arguments);
    }
};

module.exports.SockjsServer = SockjsServer;
