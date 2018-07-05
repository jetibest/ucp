window.app = {
    create: function(args)
    {
        var container = args.container;
        var ucpclient = args.ucpclient;
        
        container.innerHTML = '';
        
        var connform = elem('dl');
        
        var dt1 = elem('dt');
        dt1.innerHTML = 'Hostname:';
        connform.appendChild(dt1);
        var dd1 = elem('dd');
        var hostnamefield = elem('input');
        hostnamefield.type = 'text';
        dd1.appendChild(hostnamefield);
        connform.appendChild(dd1);
        
        var dt2 = elem('dt');
        dt2.innerHTML = 'Port:';
        connform.appendChild(dt2);
        var dd2 = elem('dd');
        var portfield = elem('input');
        portfield.type = 'text';
        dd2.appendChild(portfield);
        connform.appendChild(dd2);
        
        var dd3 = elem('dd');
        var connectbut = elem('input');
        connectbut.type = 'button';
        connectbut.value = 'Connect';
        dd3.appendChild(connectbut);
        connform.appendChild(dd3);
        
        container.appendChild(connform);
        
        var hline = elem('hr');
        container.appendChild(hline);
        
        connectbut.onclick = function()
        {
            var panel = elem('div');
            var conn = ucpclient.connect({
                hostname: hostnamefield.value,
                port: portfield.value,
                secure: false
            });
            
            var head = elem('h3');
            head.innerHTML = hostnamefield.value + ':' + portfield.value;
            panel.appendChild(head);
            
            var connbut = elem('input');
            connbut.type = 'button';
            connbut.value = 'reconnect';
            connbut.onclick = function()
            {
                conn.reconnect();
            };
            panel.appendChild(connbut);
            
            var dcbut = elem('input');
            dcbut.type = 'button';
            dcbut.value = 'disconnect';
            dcbut.onclick = function()
            {
                conn.disconnect();
            };
            panel.appendChild(dcbut);
            
            var statuslabel = elem('div');
            statuslabel.innerHTML = 'no status';
            panel.appendChild(statuslabel);
            
            var msgcontainer = elem('div');
            panel.appendChild(msgcontainer);
            
            var inputbar = elem('div');
            var input = elem('input');
            input.type = 'text';
            inputbar.appendChild(input);
            
            var sendbut = elem('input');
            sendbut.type = 'button';
            sendbut.value = 'Send';
            sendbut.onclick = function()
            {
                conn.sendmessage(input.value);
                input.value = '';
            };
            inputbar.appendChild(sendbut);
            
            panel.appendChild(inputbar);
            
            container.appendChild(panel);
            
            container.appendChild(elem('hr'));
            
            conn.on('socket-open', function()
            {
                statuslabel.innerHTML = 'connected';
            });
            conn.on('socket-close', function()
            {
                statuslabel.innerHTML = 'disconnected';
            });
            conn.on('chatmessage', function(message)
            {
                var row = elem('div');
                row.innerHTML = 'Message received: ' + strtohtml(JSON.stringify(message));
                msgcontainer.appendChild(row);
            });
            conn.on('chat-ready', function()
            {
                if(statuslabel.innerHTML === 'connected')
                {
                    statuslabel.innerHTML = 'ready to chat with end-to-end encryption using pubkey:<br />' + conn.session.pubkey.replace(/\n/gi, '<br />');
                }
            });
        };
    }
};
