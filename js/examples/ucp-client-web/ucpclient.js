window.ucpclient = {
    create: function(args)
    {
        args = args || {};
        
        var ucpclient = eventlistener.create();
        var ucp = ucp.create();
        
        ucpclient.connect = function()
        {
        };
        ucpclient.disconnect = function()
        {
        };
        ucpclient.send = function()
        {
        };
        
        return ucpclient;
    }
};
