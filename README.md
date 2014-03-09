# SockJS Wrapper

This is a wrapper for the Node.js websocket library, [SockJS](https://github.com/sockjs/sockjs-node), that adds socket.io style named events and rooms. I built it to use in [GoSuji](https://github.com/dwaltrip/gosuji), an app for playing the board game Go.

The wrapper consists of two parts:
* Client side library: `sockjs-client-wrapper.js`
  - Serve this as part of your page's javascript.
  - It depends on the [SockJS library](https://github.com/sockjs/sockjs-client), which can be loaded from a CDN by adding `<script src="http://cdn.sockjs.org/sockjs-0.3.min.js"></script>` to your page's HTML. Or you can download and serve the file yourself. For convenience, it is stored here as `sockjs-0.3.min.js`.
  - It also uses `event_emitter.js`, which is a client-side implementation of the Node.js built-in EventEmitter. Serve this file as part of your page's javascript. Check the [creator's repository](https://github.com/Wolfy87/EventEmitter/) for more information.

* Node.js server side library: `sockjs-server-wrapper.js`
  - Include this in your Node.js app: `var SockjsServer = require('/.sockjs-server-wrapper');`
  - It depends on SockJS, which you can get by adding `"sockjs": "0.3.x"` to your `package.json` file and running `npm install`.
  - It also uses some miscellaneous utility functions, which can be found in `utils.js`

## Usage

#####Initialization and basic usage:
```
// client.js
var socket = SockjsClient('http://localhost:5000/realtime');
socket.on('connect', function() {
    socket.send("Successfully connected");  // basic websocket message, same as calling SockJS 'send'

    // 'message' captures all regular websocket messages (those that aren't named events)
    socket.on('message', function(data) {
        console.log('Received message from server:', data);
    });
});
```
```
// server.js
var http = require('http'),
    server = http.createServer();
server.listen(5000);
var SockjsServer = require('/.sockjs-server-wrapper');

// passes the options parameter to the 'installHandlers' method used by SockJS
var sockjs_server = new SockjsServer(server, { prefix: '/realtime' });

socksj_server.on('connection', function(socket) {
     // this sends a message to every connected client
    sockjs_server.write_all('New client connected, with socket id:', socket.id);

    // 'close' event is emitted when the connection to the server ends
    socket.on('close', function() {
        console.log('client with id', socket.id, 'has disconnected');
    });
    // 'message' captures all regular websocket messages (those that aren't named events)
    socket.on('message', function(data) {
        console.log('Received message:', data, '-- from client with socket id:', socket.id);
    });
});
```

#####Here is a simple chat example using rooms and named events:
```
// client.js
$('#join-room').on('click', function() {
    socket.emit('join-room', { room: $('#room-name-input').val() } );
});
$('#send-chat').on('click', function() {
    socket.emit('new-chat-from-client', {
        message: $('#chat-message-input').val(),
        room: $('#room-name-input').val(),
    });
});
socket.on('new-chat', function(data) {
    $('div#chat-container').append('<p>' + data.message + '</p>');
});
```
```
// server.js
socksj_server.on('connection', function(socket) {
    // ...
    socket.on('join-room', fuction(data) {
        socket.join(data.room);
    });

    socket.on('new-message-from-client', function(data) {
        // this sends the event 'new-chat' to every socket that joined the given room
        sockjs_server.rooms(data.room).emit('new-chat', { message: data.message });
        // Room.emit also accepts an array of socket ids to skip
        // For example, to avoid sending back the current socket, you would use:
        // sockjs_server.rooms(data.room).emit('new-chat', { message: data.message }, { skip: [socket.id] });
    });
    // ...
});
```

## Notes
- See the [SockJS documentation](https://github.com/sockjs/sockjs-node) for more information. The wrapper attempts to provide an identical experience as when using SockJS, but simply with some additional useful functionality.
- The library has not yet been extensively battle tested on a high traffic production server, however so far it has worked very well for my purposes. It may need some refinement in handling of connection issues, reconnects, and other similar edge cases before it is 100% production ready.
- I am continuing to work on it, and plan to release it as an actual package on `npm`.
