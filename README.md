# ucp
Universal Chat Protocol. This protocol could easily be used to chat using `netcat`.

## Connection configuration
Default encoding is UTF-8.
Default delimiter is `\n`.
Regular sockets should be used on any port. If a server implements a WebSocket server, then it should use a separate port that interprets the WebSocket data and forwards/redirects to the ucp-port.

## Communication protocol
`login [username] [password]`
  Username has to be unique.
  Password is optional, but if the username is stored on the server that is connected to, it has to match. Unless the password was previously empty.
  Registering a new username is implied if the username does not exist yet.

`relay [username]`
  After this command is executed, all following data will be relayed to the given username. This action cannot be undone without reconnecting. The server should send 'OK' to indicate that the command succeeded, and may give additional information.
  
