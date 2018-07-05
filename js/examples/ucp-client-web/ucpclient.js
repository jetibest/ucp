window.ucpclient = {
    create: function(args)
    {
        args = args || {};
        var ucp = window.ucp;
        var eventlistener = window.eventlistener;
        
        var client = {};
        client.connect = function(options)
        {
            var connection = eventlistener.create({
                secure: !!options.secure,
                hostname: options.hostname,
                port: options.port
                // todo, implement chained relay, separate session
            });
            var protocol = ucp.protocol.create();
            var msglayer = ucp.messagelayer.create({
                acktimeoutms: 10000,
                write: function(data)
                {
                    connection.socket.send(data)
                }
            });
            
            msglayer.on('message', function(message)
            {
                protocol.parsemessage(connection.session, message);
            });
            
            connection.disconnect = function()
            {
                if(connection.socket)
                {
                    connection.socket.close();
                    delete connection.socket;
                }
            };
            connection.reconnect = function()
            {
                connection.disconnect();
                
                var wsurl = 'ws' + (connection.secure ? 's' : '') + '://' + connection.hostname + ':' + connection.port;
                var session = ucp.session.create();
                session.on('pki-load', function(keys)
                {
                    connection.privkey = keys.privkey;
                    connection.pubkey = keys.pubkey;
                    connection.privkeypem = keys.privkeypem;
                    connection.pubkeypem = keys.pubkeypem;
                    
                    msglayer.send('request pubkey');
                });
                session.on('pki-error', function(err)
                {
                });
                session.on('chatmessage', function(message)
                {
                    connection.fire('chatmessage', message);
                });
                session.on('file-start', function(file)
                {
                    session.file = {
                        filename: file.filename,
                        type: file.type,
                        chunks: []
                    };
                });
                session.on('file-chunk', function(chunk)
                {
                    session.file.chunks.push(chunk.text);
                });
                session.on('file-end', function()
                {
                    session.file.data = session.file.chunks.join(ucp.LINE_SEPARATOR);
                    
                    if(session.file.filename === 'pubkey')
                    {
                        session.pubkey = session.file.data;
                        protocol.encryptmessage(session, session.pubkey, 'dummy');
                        msglayer.send('encrypt AES-CBC ' + session.encsessionkey);
                        
                        connection.fire('chat-ready');
                    }
                });
                session.on('request-file', function(file)
                {
                    if(file.filename === 'pubkey' || file.filename === 'public-key')
                    {
                        if(connection.pubkeypem)
                        {
                            msglayer.send('send EOF pem pubkey');
                            msglayer.send(connection.pubkeypem);
                            msglayer.send('EOF');
                        }
                        else
                        {
                            msglayer.send('fail request ' + file.filename);
                        }
                    }
                });
                session.on('request-message', function(message)
                {
                    msglayer.send(message);
                });
                var ws = new WebSocket(wsurl);
                ws.onopen = function()
                {
                    connection.fire('socket-open');
                };
                ws.onerror = function()
                {
                };
                ws.onmessage = function(e)
                {
                    var reader = new FileReader();
                    reader.onload = function()
                    {
                        msglayer.receive(reader.result);
                    };
                    reader.readAsText(e.data);
                };
                ws.onclose = function()
                {
                    connection.fire('socket-close');
                };
                
                connection.session = session;
                connection.wsurl = wsurl;
                connection.socket = ws;
                
                protocol.loadpki(session);
            };
            connection.sendmessage = function(message)
            {
                msglayer.send(protocol.encryptmessage(connection.session, connection.session.pubkey, protocol.messagetimestamp(message)));
            };
            connection.protocol = protocol;
            connection.msglayer = msglayer;
            
            connection.reconnect();
            
            return connection;
        };
        return client;
    }
};
