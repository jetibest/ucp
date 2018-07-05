(function(root, factory)
{
    if(typeof define === 'function' && define.amd)
    {
        define(['eventlistener', 'forge.min'], factory);
    }
    else if(typeof module === 'object' && module.exports)
    {
        module.exports = factory(require('./eventlistener.js'), require('node-forge'));
    }
    else
    {
        root.ucp = factory(root.eventlistener, root.forge);
    }
}(this, function(eventlistener, forge)
{
    var ucp = {
        MESSAGE_START: '\x01', // SOH
        MESSAGE_HEAD_SEPARATOR: '\x1f', // US
        MESSAGE_TEXT: '\x02', // STX
        MESSAGE_END: '\x03', // ETX
        MESSAGE_SEPARATOR: '\n', // LF - for backwards compatibility
        MESSAGE_LINEFEED: '\r\v', // CR-VT
        ACKNOWLEDGE_MESSAGE: '\x06', // ACK
        ERROR_MESSAGE: '\x15', // NAK
        ENQUIRY_MESSAGE: '\x05', // ENQ
        LINE_SEPARATOR: '\n' // LF
    };
    ucp.session = {
        create: function(args)
        {
            var ucpsession = {
                mode: 'command',
                eofmarker: '.',
                login: '',
                relay: '',
                sessionkey: '',
                encsessionkey: '',
                scheme: ''
            };
            return eventlistener.create(ucpsession);
        }
    };
    ucp.simplemessagelayer = {
        create: function(args)
        {
            args = args || {};
            
            var simplemessagelayer = eventlistener.create({});
            var queue = [];
            
            simplemessagelayer.mode = 'simple';
            simplemessagelayer.write = args.write;
            simplemessagelayer.send = function(str)
            {
                simplemessagelayer.write((''+str).replace(/\n/gi, '\r\v') + ucp.MESSAGE_SEPARATOR);
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
                    if(str.charAt(i) === ucp.MESSAGE_SEPARATOR)
                    {
                        if(queue.length)
                        {
                            simplemessagelayer.fire('message', (queue.join('') + str.substring(off, i).replace(/\r$/g, '')).replace(/\r\v/gi, '\n'));
                            queue = [];
                        }
                        else
                        {
                            simplemessagelayer.fire('message', str.substring(off, i).replace(/\r$/g, '').replace(/\r\v/gi, '\n'));
                        }
                        off = i + 1;
                    }
                }
                if(off < str.length)
                {
                    queue.push(str.substring(off));
                }
            };
            simplemessagelayer.receivebuffer = function(buf)
            {
                return simplemessagelayer.receive(buf.toString('utf8'));
            };
            return simplemessagelayer;
        }
    };
    ucp.messagelayer = {
        create: function(args)
        {
            args = args || {};
            
            var messagelayer = eventlistener.create({});
            var acktimeoutms = args.acktimeoutms || 10000;
            var queue = [];
            var message = {};
            var state = {};
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
                        var data = ucp.ENQUIRY_MESSAGE + e.id + ucp.MESSAGE_SEPARATOR;
                        messagelayer.fire('debug-write', data);
                        messagelayer.write(data);
                    }
                }
            };
            var receivemessage = function(message)
            {
                messagelayer.fire('debug-read', message.type + '(' + (message.id || '') + (message.previd ? ':' + message.previd : '') + '):"' + (message.text || '') + '"');
                if(message.type === 'SMSG')
                {
                    messagelayer.mode = 'simple';
                    messagelayer.fire('message', message.text);
                }
                else if(message.type === 'MSG')
                {
                    messagelayer.mode = 'complex';
                    if(message.previd === prevreceivedid)
                    {
                        prevreceivedid = message.id;
                        messagelayer.fire('message', message.text);
                        messagelayer.write(ucp.ACKNOWLEDGE_MESSAGE + message.id + ucp.MESSAGE_SEPARATOR);
                    }
                    else
                    {
                        var data = ucp.ERROR_MESSAGE + prevreceivedid + ucp.MESSAGE_SEPARATOR;
                        messagelayer.fire('debug-write', data);
                        messagelayer.write(data);
                    }
                }
                else if(message.type === 'ENQ')
                {
                    if(message.id === prevreceivedid)
                    {
                        var data = ucp.ACKNOWLEDGE_MESSAGE + prevreceivedid + ucp.MESSAGE_SEPARATOR;
                        messagelayer.fire('debug-write', data);
                        messagelayer.write(data);
                    }
                    else
                    {
                        var data = ucp.ERROR_MESSAGE + prevreceivedid + ucp.MESSAGE_SEPARATOR;
                        messagelayer.fire('debug-write', data);
                        messagelayer.write(data);
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
                            messagelayer.fire('delivered', e.id);
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
                                messagelayer.fire('debug-write', e.data);
                                messagelayer.write(e.data);
                            }
                        }
                        
                        if(index)
                        {
                            for(var i=0;i<index;++i)
                            {
                                delete historymap[historyarr[i].id];
                                messagelayer.fire('delivered', historyarr[i].id);
                            }
                            historyarr.splice(0, index);
                        }
                        
                        checkhistory();
                    }
                }
            };
            
            messagelayer.mode = 'complex';
            messagelayer.write = args.write;
            messagelayer.send = function(str)
            {
                ++id;
                str = ''+ str;
                var data = ucp.MESSAGE_START + id + ucp.MESSAGE_HEAD_SEPARATOR + str.length + ucp.MESSAGE_HEAD_SEPARATOR + prev.id + ucp.MESSAGE_TEXT + str.replace(/\n/gi, '\r\v') + ucp.MESSAGE_SEPARATOR;
                var entry = {
                    id: id,
                    status: 0,
                    previd: prev.id,
                    length: str.length,
                    data: data,
                    epochms: Date.now()
                };
                historyarr.push(entry);
                historymap[entry.identifier] = entry;
                messagelayer.fire('debug-write', entry.data);
                messagelayer.write(entry.data);
                prev = entry;
                checkhistory();
                return id;
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
                            message.id = queue.join('');
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
                            message.previd = queue.join('');
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
                            message.text = queue.join('').replace(/\r$/gi, '').replace(/\r\v/gi, '\n');
                            receivemessage(message);
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
                            message.id = queue.join('').replace(/\r$/gi, '').replace(/\r\v/gi, '\n');
                            receivemessage(message);
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
                            message.id = queue.join('').replace(/\r$/gi, '').replace(/\r\v/gi, '\n');
                            receivemessage(message);
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
                            message.id = queue.join('').replace(/\r$/gi, '').replace(/\r\v/gi, '\n');
                            receivemessage(message);
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
                        queue = [];
                    }
                    else if(v === ucp.ACKNOWLEDGE_MESSAGE)
                    {
                        state.ack = 1;
                        queue = [];
                    }
                    else if(v === ucp.ERROR_MESSAGE)
                    {
                        state.nak = 1;
                        queue = [];
                    }
                    else if(v === ucp.ENQUIRY_MESSAGE)
                    {
                        state.enq = 1;
                        queue = [];
                    }
                    else if(v === ucp.MESSAGE_SEPARATOR)
                    {
                        message.type = 'SMSG';
                        message.text = queue.join('').replace(/\r$/gi, '').replace(/\r\v/gi, '\n');
                        receivemessage(message);
                        message = {};
                        queue = [];
                    }
                    else
                    {
                        queue.push(v);
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
            args = args || {};
            
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
                            '  relay',
                            '  encrypt',
                            '  say'
                        ].join('\n'));
                        return true;
                    }
                },
                {
                    regex: /^confirm ([^ ]+) ([^ ]+)$/gi,
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
                    regex: /^request(| .*)$/gi,
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
                    regex: /^send(| [^ ]*)(| [^ ]*)(| [^ ]*)$/gi,
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
                },
                {
                    regex: /^encrypt(| [^ ]*)(| [^ ]*)$/gi,
                    handler: function($0, $1, $2)
                    {
                        this.scheme = $1.replace(/^ /gi, '');
                        this.encsessionkey = $2.replace(/^ /gi, '');
                        this.sessionkey = rsadecrypt(pki.privkey, this.encsessionkey);
                        return true;
                    }
                },
                {
                    regex: /^relay(| .*)$/gi,
                    handler: function($0, $1)
                    {
                        this.mode = 'relay';
                        this.relay = $1.replace(/^ /gi, '');
                        return true;
                    }
                }
            ];
            
            var exportprivkey = function(privkey)
            {
                if(typeof privkey === 'string')
                {
                    return privkey;
                }
                if(typeof Buffer !== 'undefined' && privkey instanceof Buffer)
                {
                    return privkey.toString();
                }
                return forge.pki.privateKeyToPem(privkey) || privkey;
            };
            var exportpubkey = function(pubkey)
            {
                if(typeof pubkey === 'string')
                {
                    return pubkey;
                }
                if(typeof Buffer !== 'undefined' && pubkey instanceof Buffer)
                {
                    return pubkey.toString();
                }
                return forge.pki.publicKeyToPem(pubkey) || pubkey;
            };
            var importprivkey = function(privkey)
            {
                if(typeof privkey === 'string' || (typeof Buffer !== 'undefined' && privkey instanceof Buffer))
                {
                    try
                    {
                        privkey = forge.pki.privateKeyFromPem(privkey) || privkey;
                    }
                    catch(err)
                    {
                        return null;
                    }
                }
                return privkey;
            };
            var importpubkey = function(pubkey)
            {
                if(typeof pubkey === 'string' || (typeof Buffer !== 'undefined' && pubkey instanceof Buffer))
                {
                    try
                    {
                        pubkey = forge.pki.publicKeyFromPem(pubkey) || pubkey;
                    }
                    catch(err)
                    {
                        return null;
                    }
                }
                return pubkey;
            };
            var pki = {
                privkey: importprivkey(args.privkey) || '',
                pubkey: importpubkey(args.pubkey) || ''
            };
            var rsadecrypt = function(privkey, str)
            {
                try
                {
                    return privkey ? privkey.decrypt(forge.util.hexToBytes(str)) : '';
                }
                catch(err)
                {
                    return null;
                }
            };
            var rsaencrypt = function(pubkey, str)
            {
                try
                {
                    return pubkey ? forge.util.bytesToHex(pubkey.encrypt(str)) : '';
                }
                catch(err)
                {
                    return null;
                }
            };
            var md = forge ? forge.md.sha256.create() : null;
            var decipherCache = {};
            var encipherCache = {};
            var decryptmessage = function(scheme, sessionkey, str)
            {
                if(!forge)
                {
                    return str;
                }
                if(scheme === 'AES-CBC')
                {
                    if(str.length > 3 && str.substring(0, 3) === 'IV:')
                    {
                        var i = str.indexOf(',');
                        if(i > 3)
                        {
                            var dkey = scheme + ':' + sessionkey;
                            var d = decipherCache[dkey];
                            if(!d)
                            {
                                d = forge.cipher.createDecipher(scheme, forge.util.hexToBytes(sessionkey));
                                decipherCache[dkey] = d;
                            }
                            d.start({iv: forge.util.hexToBytes(str.substring(3, i))});
                            d.update(forge.util.createBuffer(forge.util.hexToBytes(str.substring(i + 1))));
                            if(d.finish())
                            {
                                return forge.util.encodeUtf8(d.output);
                            }
                            else
                            {
                                return 'fail decrypt ' + str;
                            }
                        }
                    }
                }
                return str;
            };
            var encryptmessage = function(scheme, sessionkey, str)
            {
                if(!forge)
                {
                    return str;
                }
                if(scheme === 'AES-CBC')
                {
                    md.update(forge.random.getBytesSync(32));
                    var ivhex = md.digest().toHex();
                    var ekey = scheme + ':' + sessionkey;
                    var e = encipherCache[ekey];
                    if(!e)
                    {
                        e = forge.cipher.createCipher(scheme, forge.util.hexToBytes(sessionkey));
                        encipherCache[ekey] = e;
                    }
                    e.start({iv: forge.util.hexToBytes(ivhex)});
                    e.update(forge.util.createBuffer(str));
                    e.finish();
                    
                    return 'IV:' + ivhex + ',' + e.output.toHex();
                }
                return str;
            };
            return {
                importprivkey: importprivkey,
                importpubkey: importpubkey,
                exportprivkey: exportprivkey,
                exportpubkey: exportpubkey,
                loadpki: function(ucpsession, pemprivkey, pempubkey)
                {
                    if(!pemprivkey || !pempubkey)
                    {
                        forge.pki.rsa.generateKeyPair({bits: 4096, workers: 2}, function(err, keypair)
                        {
                            if(err || !keypair)
                            {
                                ucpsession.fire('pki-error', err);
                                return;
                            }
                            pki.privkey = keypair.privateKey;
                            pki.pubkey = keypair.publicKey;
                            try
                            {
                                ucpsession.fire('pki-load', {
                                    privkey: pki.privkey,
                                    pubkey: pki.pubkey,
                                    privkeypem: forge.pki.privateKeyToPem(pki.privkey),
                                    pubkeypem: forge.pki.publicKeyToPem(pki.pubkey)
                                });
                            }
                            catch(err)
                            {
                                ucpsession.fire('pki-error', err);
                            }
                        });
                    }
                    else
                    {
                        try
                        {
                            pki.privkey = forge.pki.privateKeyFromPem(pemprivkey);
                            pki.pubkey = forge.pki.publicKeyFromPem(pempubkey);

                            ucpsession.fire('pki-load', {
                                privkey: pki.privkey,
                                pubkey: pki.pubkey,
                                privkeypem: pemprivkey,
                                pubkeypem: pempubkey
                            });
                        }
                        catch(err)
                        {
                            ucpsession.fire('pki-error', err);
                        }
                    }
                },
                encryptmessage: function(ucpsession, pubkey, message)
                {
                    if(!ucpsession.sessionkey)
                    {
                        md.update(forge.random.getBytesSync(32));
                        ucpsession.sessionkey = md.digest().toHex();
                        ucpsession.encsessionkey = rsaencrypt(importpubkey(pubkey), ucpsession.sessionkey);
                    }
                    if(!ucpsession.scheme)
                    {
                        ucpsession.scheme = 'AES-CBC';
                    }
                    return encryptmessage(ucpsession.scheme, ucpsession.sessionkey, message) || '';
                },
                messagetimestamp: function(epochms, message)
                {
                    if(typeof epochms === 'string')
                    {
                        message = epochms;
                        epochms = 0;
                    }
                    return '[' + new Date(epochms || Date.now()).toISOString() + '] ' + (message || '');
                },
                parsemessage: function(ucpsession, str)
                {
                    var message = str;
                    
                    if(ucpsession.scheme && ucpsession.sessionkey)
                    {
                        message = decryptmessage(ucpsession.scheme, ucpsession.sessionkey, message);
                    }
                    
                    if(ucpsession.mode === 'relay')
                    {
                        ucpsession.fire('relay', message);
                        return;
                    }
                    
                    message = parsetimestamp(message);
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
        }
    };
    return ucp;
}));
