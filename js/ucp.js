(function(root, factory)
{
    if(typeof define === 'function' && define.amd)
    {
        define(['eventlistener'], factory);
    }
    else if(typeof module === 'object' && module.exports)
    {
        module.exports = factory(require('eventlistener'));
    }
    else
    {
        root.ucp = factory(root.eventlistener);
    }
}(this, function(eventlistener)
{
    var ucp = {
        MESSAGE_START: '\x01', // SOH
        MESSAGE_TEXT: '\x02', // STX
        MESSAGE_END: '\x03', // ETX
        MESSAGE_SEPARATOR: '\x17', // ETB
        MESSAGE_HEAD_SEPARATOR: '\x1e', // US
        ACKNOWLEDGE_MESSAGE: '\x06', // ACK
        ERROR_MESSAGE: '\x15', // NAK
        ENQUIRY_MESSAGE: '\x05', // ENQ
        LINE_SEPARATOR: '\n', // LF
        INTERNAL_LINE_SEPARATOR: '\r\v' // CR-VT
    };
    ucp.session = {
        create: function(args)
        {
            var ucpsession = {
                mode: 'command',
                eofmarker: '.',
                login: '',
                relay: ''
            };
            return eventlistener.create(ucpsession);
        }
    };
    ucp.simplemessagelayer = {
        create: function(args)
        {
            var simplemessagelayer = eventlistener.create({});
            var writefnc = args.writefnc;
            var queue = [];
            
            simplemessagelayer.send = function(str)
            {
                writefnc(str + '\n');
            };
            simplemessagelayer.receive = function(str)
            {
                if(!str)
                {
                    return;
                }
                var off = 0;
                for(var i=0;i<str.length;++i)
                {
                    if(str.charAt(i) === '\n')
                    {
                        if(queue.length)
                        {
                            simplemessagelayer.fire('message', queue.join('') + str.substring(off, i).replace(/\r$/g, ''));
                            queue = [];
                        }
                        else
                        {
                            simplemessagelayer.fire('message', str.substring(off, i).replace(/\r$/g, ''));
                        }
                        off = i + 1;
                    }
                }
                if(off < str.length)
                {
                    queue.push(str.substring(off));
                }
            };
            return simplemessagelayer;
        }
    };
    ucp.messagelayer = {
        create: function(args)
        {
            var messagelayer = eventlistener.create({});
            var writefnc = args.writefnc;
            var acktimeoutms = args.acktimeoutms;
            var queue = [];
            var message = {};
            var state = {};
            var listeners = {};
            var id = 0;
            var prev = {id: ''};
            var historyarr = [];
            var historymap = {};
            var prevreceivedid = '';
            var checkhistorytimer;
            var checkhistoryepochms = 0;
            
            var checkhistory = function()
            {
                if(!checkhistoryepochms)
                {
                    clearTimeout(checkhistorytimer);
                    checkhistorytimer = setTimeout(checkhistory, acktimeoutms);
                    return;
                }
                var ems = Date.now();
                if(checkhistoryepochms + acktimeoutms >= ems)
                {
                    clearTimeout(checkhistorytimer);
                    checkhistorytimer = setTimeout(checkhistory, checkhistoryepochms + acktimeoutms - ems);
                    return;
                }
                checkhistoryepochms = ems;
                
                for(var i=0;i<historyarr.length;++i)
                {
                    var e = historyarr[i];
                    if(!e.status && e.epochms + acktimeoutms < ems)
                    {
                        writefnc(ucp.ENQUIRY_MESSAGE + e.id + ucp.MESSAGE_SEPARATOR);
                    }
                }
            };
            var receivemessage = function(message)
            {
                if(message.type === 'MSG')
                {
                    if(message.previd === prevreceivedid)
                    {
                        prevreceivedid = message.id;
                        writefnc(ucp.ACKNOWLEDGE_MESSAGE + message.id + ucp.MESSAGE_SEPARATOR);
                        messagelayer.fire('message', message.text);
                    }
                    else
                    {
                        writefnc(ucp.ERROR_MESSAGE + prevreceivedid + ucp.MESSAGE_SEPARATOR);
                    }
                }
                else if(message.type === 'ENQ')
                {
                    if(message.id === prevreceivedid)
                    {
                        writefnc(ucp.ACKNOWLEDGE_MESSAGE + prevreceivedid + ucp.MESSAGE_SEPARATOR);
                    }
                    else
                    {
                        writefnc(ucp.ERROR_MESSAGE + prevreceivedid + ucp.MESSAGE_SEPARATOR);
                    }
                }
                else if(message.type === 'ACK')
                {
                    var entry = historymap[message.id];
                    if(entry)
                    {
                        entry.status = 1;
                        
                        var i = -1;
                        while(++i < historyarr.length)
                        {
                            var e = historyarr[i];
                            if(!e.status)
                            {
                                break;
                            }
                            delete historymap[e.id];
                        }
                        if(i)
                        {
                            historyarr.splice(0, i);
                        }
                        
                        checkhistory();
                    }
                }
                else if(message.type === 'NAK')
                {
                    var entry = historymap[message.id] || prev;
                    if(entry)
                    {
                        var found = false;
                        var index = 0;
                        for(var i=0;i<historyarr.length;++i)
                        {
                            var e = historyarr[i];
                            if(e.id === entry.id)
                            {
                                found = true;
                                index = i + 1;
                            }
                            else if(found)
                            {
                                writefnc(e.data);
                            }
                        }
                        
                        if(index)
                        {
                            for(var i=0;i<index;++i)
                            {
                                delete historymap[historyarr[i].id];
                            }
                            historyarr.splice(0, index);
                        }
                        
                        checkhistory();
                    }
                }
            };
            
            messagelayer.send = function(str)
            {
                ++id;
                var data = ucp.MESSAGE_START + id + ucp.MESSAGE_HEAD_SEPARATOR + str.length + ucp.MESSAGE_HEAD_SEPARATOR + prev.id + ucp.MESSAGE_TEXT + str + ucp.MESSAGE_SEPARATOR;
                var entry = {
                    id: id,
                    status: 0,
                    previd: previd,
                    length: str.length,
                    data: data,
                    epochms: Date.now()
                };
                historyarr.push(entry);
                historymap[entry.identifier] = entry;
                writefnc(entry.data);
                prev = entry;
                checkhistory();
            };
            messagelayer.receive = function(str)
            {
                if(!str)
                {
                    return;
                }
                for(var v,i=0;i<str.length;++i)
                {
                    v = str.charAt(i);
                    if(state.msg === 1)
                    {
                        if(v === ucp.MESSAGE_HEAD_SEPARATOR)
                        {
                            message.id = queue.jooin('');
                            message.type = 'MSG';
                            queue = [];
                            ++state.msg;
                        }
                        else
                        {
                            queue.push(v);
                        }
                    }
                    else if(state.msg === 2)
                    {
                        if(v === ucp.MESSAGE_HEAD_SEPARATOR)
                        {
                            message.length = queue.join('');
                            queue = [];
                            ++state.msg;
                        }
                        else if(v === ucp.MESSAGE_TEXT)
                        {
                            message.length = queue.join('');
                            queue = [];
                            state.msg = 4;
                        }
                        else
                        {
                            queue.push(v);
                        }
                    }
                    else if(state.msg === 3)
                    {
                        if(v === ucp.MESSAGE_TEXT)
                        {
                            messages.previd = queue.join('');
                            queue = [];
                            ++state.msg;
                        }
                        else
                        {
                            queue.push(v);
                        }
                    }
                    else if(state.msg === 4)
                    {
                        // TODO: use message.length to look ahead in buffer
                        if(v === ucp.MESSAGE_SEPARATOR)
                        {
                            message.text = queue.join('');
                            messagelayer.receivemessage(message);
                            message = {};
                            queue = [];
                            state.msg = 0;
                        }
                        else
                        {
                            queue.push(v);
                        }
                    }
                    else if(state.ack === 1)
                    {
                        if(v === ucp.MESSAGE_SEPARATOR)
                        {
                            message.type = 'ACK';
                            message.id = queue.joion('');
                            messagelayer.receivemessage(message);
                            message = {};
                            queue = [];
                            state.ack = 0;
                        }
                        else
                        {
                            queue.push(v);
                        }
                    }
                    else if(state.nak === 1)
                    {
                        if(v === ucp.MESSAGE_SEPARATOR)
                        {
                            message.type = 'NAK';
                            message.id = queue.join('');
                            messagelayer.receivemessage(message);
                            message = {};
                            queue = [];
                            state.nak = 0;
                        }
                        else
                        {
                            queue.push(v);
                        }
                    }
                    else if(state.enq === 1)
                    {
                        if(v === ucp.MESSAGE_SEPARATOR)
                        {
                            message.type = 'ENQ';
                            message.id = queue.join('');
                            messagelayer.receivemessage(message);
                            message = {};
                            queue = [];
                            state.enq = 0;
                        }
                        else
                        {
                            queue.push(v);
                        }
                    }
                    else if(v === ucp.MESSAGE_START)
                    {
                        state.msg = 1;
                    }
                    else if(v === ucp.ACKNOWLEDGE_MESSAGE)
                    {
                        state.ack = 1;
                    }
                    else if(v === ucp.ERROR_MESSAGE)
                    {
                        state.nak = 1;
                    }
                    else if(v === ucp.ENQUIRY_MESSAGE)
                    {
                        state.enq = 1;
                    }
                }
            };
            messagelayer.receivebuffer = function(buf)
            {
                return messagelayer.receive(buf.toString('utf8'));
            };
            return messagelayer;
        }
    };
    ucp.protocol = {
        create: function(args)
        {
            var parsetimestamp = function(str)
            {
                var tms = 0;
                str = str.replace(/^\[([^\]]+)\] /gi, function($0, $1)
                {
                    try
                    {
                        tms = new Date($1).getTime();
                        return '';
                    }
                    catch(err){tms = 0;}
                    return $0;
                });
                return {sentepochms: tms, text: str};
            };
            var commands = [
                {
                    regex: /^help$/gi,
                    handler: function($0, $1)
                    {
                        this.fire('request-message', [
                            'Available commands:',
                            '  help',
                            '  chat',
                            '  request',
                            '  send',
                            '  login',
                            '  relay'
                        ].join('\n'));
                        return true;
                    }
                },
                {
                    regex: /^confirm (.+) (.+)$/gi,
                    handler: function($0, $1, $2)
                    {
                        var epochms = new Date($2).getTime();
                        if($1 === 'read')
                        {
                            this.fire('confirm-read', epochms);
                        }
                        else if($1 === 'delivery')
                        {
                            this.fire('confirm-delivery', epochms);
                        }
                        return true;
                    }
                },
                {
                    regex: /^login ([a-zA-Z0-9_-]{1,32})(| .*)$/gi,
                    handler: function($0, $1, $2)
                    {
                        var self = this;
                        var username = $1;
                        var password = $2.replace(/^ /gi, '');
                        this.fire('request-login', {username: username, password: password}, function(err)
                        {
                            if(err)
                            {
                                self.fire('request-message', 'fail ' + $0 + ': ' + err);
                                return;
                            }
                            self.fire('request-message', 'success ' + $0);
                            self.fire('request-relayers', {username: username}, function(err, list)
                            {
                                if(err || !list)
                                {
                                    return;
                                }
                                for(var i=0;i<list.length;++i)
                                {
                                    var entry = list[i];
                                    self.fire('request-message', 'info relay ' + entry.username + ' sent ' + entry.count + ' messages, relay to read.');
                                }
                            });
                        });
                        return true;
                    }
                },
                {
                    regex: /^chat(| .*)$/gi,
                    handler: function($0, $1)
                    {
                        this.mode = 'chat';
                        this.eofmarker = $1.replace(/^ /gi, '') || this.eofmarker;
                        return true;
                    }
                },
                {
                    regex: /^say(| .*)$/gi,
                    handler: function($0, $1)
                    {
                        this.fire('chatmessage', $1.replace(/^ /gi, ''));
                        return true;
                    }
                },
                {
                    regex: /^(success|succeeded|successful)(| .*)$/gi,
                    handler: function($0, $1, $2)
                    {
                        this.fire('command-success', $2.replace(/^ /gi, ''));
                        return true;
                    }
                },
                {
                    regex: /^(fail|failed|failure)(| .*)$/gi,
                    handler: function()
                    {
                        this.fire('command-fail', $2.replace(/^ /gi, ''));
                        return true;
                    }
                },
                {
                    regex: /^ping(| .*)$/gi,
                    handler: function($0, $1)
                    {
                        this.fire('request-message', 'pong' + ($1 || ''));
                        return true;
                    }
                },
                {
                    regex: /^info(| .*)$/gi,
                    handler: function($0, $1)
                    {
                        this.fire('info', $1.replace(/^ /gi, ''));
                        return true;
                    }
                },
                {
                    regex: /request(| .*)/gi,
                    handler: function($0, $1)
                    {
                        var filename = $1.replace(/^ /gi, '');
                        if(filename.length)
                        {
                            this.fire('request-file', {filename: filename});
                            return true;
                        }
                    }
                },
                {
                    regex: /send(| [^ ]+)(| [^ ]+)(| .*)/gi,
                    handler: function($0, $1, $2, $3)
                    {
                        this.mode = 'send';
                        this.eofmarker = $1.replace(/^ /gi, '');
                        this.fire('file-start', {
                            filename: $3.replace(/^ /gi, ''),
                            type: $2.replace(/^ /gi, '')
                        });
                        return true;
                    }
                }
            ];
            return {
                messagetimestamp: function(epochms, message)
                {
                    return '[' + new Date(epochms || Date.now()).toISOString() + '] ' + (message || '');
                },
                parsemessage: function(ucpsession, str)
                {
                    var message = parsetimestamp(str);
                    message.receivedepochms = Date.now();

                    if(ucpsession.mode === 'command')
                    {
                        var isParsed = false;
                        for(var i=0;i<commands.length;++i)
                        {
                            var cmd = commands[i];
                            message.text.replace(cmd.regex, function()
                            {
                                if(cmd.handler.apply(ucpsession, arguments))
                                {
                                    isParsed = true;
                                    i = commands.length;
                                }
                            });
                        }
                        
                        if(!isParsed)
                        {
                            ucpsession.fire('chatmessage', message);
                        }
                    }
                    else if(ucpsession.mode === 'send')
                    {
                        if(message.text === ucpsession.eofmarker)
                        {
                            ucpsession.mode = 'command';
                            ucpsession.fire('file-end', message);
                        }
                        else
                        {
                            ucpsession.fire('file-chunk', message);
                        }
                    }
                    else if(ucpsession.mode === 'chat')
                    {
                        if(message.text === ucpsession.eofmarker)
                        {
                            ucpsession.mode = 'command';
                        }
                        else
                        {
                            ucpsession.fire('chatmessage', message);
                        }
                    }
                }
            };
        };
    };
    return ucp;
}));
