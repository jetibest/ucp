# ucp (Draft)
Universal Chat Protocol. This protocol could easily be used to chat using `netcat`. It focusses on consistency and readability.

## Connection configuration
Default encoding is UTF-8.
Default delimiter for messages is `\n` (`\r\n` is the deprecated equivalent to ensure Windows compatibility).
Regular sockets should be used on any port. If a server implements a WebSocket server, then it should use a separate port that interprets the WebSocket data and forwards/redirects to the ucp-port.

## Communication protocol
The communication consists of sending and receiving messages between two clients. However, a server should be used in order to be able to: send messages to a client that is currently offline; send messages to a channel as a group-chat; send messages to a client behind a NAT, without a static IP-address, or without port forwarding.

## Modes
### `command`-mode
This is the default mode. It is always the initial mode when connecting. Every incoming message is parsed as a command. However, if no command is matched, it is interpreted as a chat message.

### `chat`-mode
This mode enables chatting without commands being parsed. The chat-mode can be exited by reconnecting, or by sending the EOF-marker in a separate message (e.g. a dot `.`). After exiting the chat-mode, the previous mode is re-established (the command-mode).

### `send`-mode
This mode enables transferring multi-line files. When sending binary files, consider using Base64 or hexadecimal encoding. The send-mode can be exited by reconnecting, or by sending the EOF-marker in a separate message (e.g. a dot `.`). After exiting the send-mode, the previous mode is re-established (the command-mode).

## Message
A message is by default encoded in UTF-8.
Messages are separated using the line separator `\n` (or the deprecated `\r\n` for compatibility with Windows).
Within the same message, multiple lines may be encoded using `\r\v`.
UTF-8 emoji-characters may be interpreted, and appropriately visualized in the client.
Formatting of a message by parsing is only expected through (human-)readable structures such as Markdown.
Inline files and images may be sent with the 

## Commands
Commands should always conform to the following Regular Expression: `^[a-z-]+$`. Clients are free to implement their own additional commands, while taking into account consistency and readability.

`help`
  This command should at least list the implemented commands.

`login [username] [password]`
  Username has to be unique.
  Password is optional, but if the username is stored on the server that is connected to, it has to match. Unless the password was previously empty.
  Registering a new username is implied if the username does not exist yet.
  Username be formatted as `realname~user`, in which case the `~user` part may be greyed out so that the `realname` is shown as the display name or "nickname".
  However, this is only applicable if the user would like to use a name that is not unique: `Alice~007`.

`relay [username]`
  After this command is executed, all following data will be relayed to the given username. This action cannot be undone without reconnecting. The server should send 'OK' to indicate that the command succeeded, and may give additional information.

`chat [EOF-marker]`
  Enable chat-mode until EOF-marker.
  Gives the opportunity to send messages which will not be interpreted as a command.

`send [EOF-marker] [MIME-type/extension;encoding] [filename]`
  Enable send-mode until EOF-marker.
  Gives the opportunity to a file with the given filename.
  The MIME-type or extension should provide an indication as to how the file should be presented or which encoding is used.
  Encoding may also be sent as part of the file, such as `data:image/png;base64,[...]`.
  In this case, the equivalent MIME-type would be `image/png;base64`.

`refer [filename/identifier]`
  Refer to a file that may or may not have been sent. If the other party does not have the file yet, it may `request` it.

`request [filename/identifier]`
  Some special identifiers include `public-key` to enable end-to-end encryption, `PONG <identifier>` to support connecting to an IRC-server.

`encrypt [cipher/scheme] [session-key]`
  Enables end-to-end encryption using the given cipher/scheme.
  This command is supposed to be encrypted using PKI.
  Use `request public-key` to automatically receive the public key from the other party.
  The session-key will be used for encrypting/decrypting messages.

`join [channel] [password]`
  Only possible after a succesful `login`.
  
`ping [identifier]`
  Expect a `pong` command back, to test presence and lag.

`pong [identifier]`
  Sent in reply to a `ping` command. The identifier should be the same as the one that was received.

`say [message]`
  Send a message which will not be interpreted as a command, may not include linefeed characters (`\n`).

## IRC Compatibility
The ucp is compatible with IRC (Internet Relay Chat) using the following aliases:

 - `HELP` -> `help`
 - `JOIN <channel1>{,<channel2>} [<key1>{,<key2>}]` -> `join [channel1] [key1]\njoin [channel2] [key2]`
 - `PASS <password>` `USER <user> <mode> <unused> <realname>` `NICK <realname~user>` -> `login [realname~user] [password]`
 - `PRIVMSG <msgtarget> <message>` -> `say [message]`
 - `PING <identifier>` -> `ping [identifier]`
 - `PONG <identifier>` -> `pong [identifier]`

All other IRC commands should be either manually inserted or implemented by the client. An ucp client may be used to connect to an IRC server, and an IRC client may also be used to connect to an ucp server.

## Implementations
The ucp is implemented in the following languages:

 - Javascript (using [forge](https://github.com/digitalbazaar/forge) as dependency to support end-to-end encryption).
