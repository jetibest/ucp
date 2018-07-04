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
            var conn = ucpclient.connect({
                hostname: hostnamefield.value,
                port: portfield.value,
                secure: false
            });
            conn.on('socket-open', function(){});
            conn.on('socket-close', function(){});
            conn.on('chatmessage', function(message){});
            conn.on('chatready', function(){});// handshake with encryption and everything done, so we can start messaging
            // create new panel for each connection, with reconn, disconn buttons
        };
    }
};
