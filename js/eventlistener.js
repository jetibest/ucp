(function(root, factory)
{
    if(typeof define === 'function' && define.amd)
    {
        define([], factory);
    }
    else if(typeof module === 'object' && module.exports)
    {
        module.exports = factory();
    }
    else
    {
        root.eventlistener = factory();
    }
}(this, function(eventlistener)
{
    return {
        create: function(obj)
        {
            var map = {};
            obj = obj || {};
            obj.on = function(key, fnc)
            {
                var dot = key.indexOf('.');
                var id = '';
                if(dot >= 0)
                {
                    id = key.substring(dot + 1);
                    key = key.substring(0, dot);
                }
                if(!map[key])
                {
                    map[key] = [];
                }
                map[key].push({id: id, fnc: fnc});
            };
            obj.off = function(key)
            {
                var dot = key.indexOf('.');
                var id = '';
                if(dot >= 0)
                {
                    id = key.substring(dot + 1);
                    key = key.substring(0, dot);

                    if(dot === 0)
                    {
                        for(var k in map)
                        {
                            // warning: k.length avoids infinite loop here
                            if(Object.prototype.hasOwnProperty.call(map, k) && k.length)
                            {
                                obj.off(k + '.' + id);
                            }
                        }
                        return;
                    }
                }
                var fncs = map[key];
                if(fncs && fncs.length)
                {
                    if(id)
                    {
                        for(var i=0;i<fncs.length;++i)
                        {
                            if(fncs[i].id === id)
                            {
                                fncs.splice(i, 1);
                                --i;
                            }
                        }
                    }
                    else
                    {
                        map[key] = [];
                    }
                }
            };
            obj.fire = function(key)
            {
                var fncs = map[key];
                if(fncs && fncs.length)
                {
                    var vals = Array.from(arguments).slice(1);
                    for(var i=0;i<fncs.length;++i)
                    {
                        setTimeout((function(fnc, vals)
                        {
                            return function()
                            {
                                fnc.fnc.apply(obj, vals);
                            };
                        })(fncs[i], vals), 0);
                    }
                    return fncs.length;
                }
                return 0;
            };
            return obj;
        }
    };
}));
