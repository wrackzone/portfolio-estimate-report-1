Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items: [
    {
        xtype: 'container',
        itemId: 'selectButton',
        columnWidth: 1
    }
    ,
    {
        xtype: 'container',
        itemId: 'grid',
        columnWidth: 1
    }

    ],
    
    launch: function() {
        
        var that = this;
        
        that.priorities = ["P1","P2","P3"];
        that.sizes = ["S","M","L","XL"];
        that.keys = [];
        that.columnKeys = [];
        
        _.each(that.priorities,function(priority) {
            _.each(that.sizes,function(sz) {
                that.keys.push(priority+"-"+sz);
                that.columnKeys.push(priority.substring(0,2)+"-"+sz);
            });
        });

        //  this.down('#selectButton').add({
        //     xtype:  'button',
        //     itemId: 'buttonSelect',
        //     text:   'Select Feature'
        // });
        that._runQuery( function(results) { 
            var themes = results.Results;
            
            that._runQuery( function(results) { 
                var epics = results.Results;
                
                that._runQuery( function(results) {
                    // preprocess
                    _.each( results.Results, function(result) {
                        
                        result.Estimate = ( result.PreliminaryEstimate != null ? result.PreliminaryEstimate.Name : "None");
                        result.Epic = ( result.Parent != null ? result.Parent.Name : "None");
                        //result.Priority = "P1";
                        
                        // find the theme for the initiative
                        if (result.Parent != null) {
                            var init = result.Parent;
                            // find the initiative
                            var init = _.find(epics, function(i) { return i.ObjectID == result.Parent.ObjectID });
                            if (init != null) {
                                if (init.Parent !=null) {
                                    result.Theme = init.Parent.Name;
                                }
                            }
                        }
                    });
                    
                    var ss = [];
                    
                    var r = results.Results;
                    var themes = _.groupBy( r, "Theme" );
                    _.each( _.keys(themes), function(theme) {
                        var epics = _.groupBy( themes[theme], "Epic" );
                        _.each( _.keys(epics), function(epic) {
                            var priorityBuckets = _.groupBy( epics[epic], "Priority");
                            _.each( _.keys(priorityBuckets), function(priority) {
                                var sizeBuckets = _.groupBy( priorityBuckets[priority], "Estimate");
                                _.each( _.keys( sizeBuckets), function( sizeBucket) {
                                    // find the summary record
                                    var rec = _.find(ss, function(s) { return s.Theme == theme && s.Epic == epic});
                                    if (rec==null) {
                                        rec = that._createSummaryRecord(theme,epic);
                                        console.log("rec",rec);
                                        ss.push(rec);
                                    }
                                    rec[priority+"-"+sizeBucket] = sizeBuckets[sizeBucket].length;
                                });
                            });
                        });
                    });
                    
                    console.log("summary:",ss);
                    that._createStore(ss);                    
                    
                }, "PortfolioItem/Feature","","Parent,ObjectID,Name,Value,PreliminaryEstimate,Priority");
            
            }, "PortfolioItem/Epic","","Parent,ObjectID,Name,Value,PreliminaryEstimate");    
        
        }, "PortfolioItem/Theme","","Parent,ObjectID,Name,Value,PreliminaryEstimate");
        
        
    }
    ,
    _cellRenderer : function(value) {
        return ( value == 0 ? "" : value);
    }
    ,
    _createStore: function(summary) {
        
        var that = this;

        var container = this.down("#grid");
        var fields = ['Theme',"Epic"];
        var columns = [
                { text: 'Theme',  dataIndex: 'Theme' },
                { text: 'Epic', dataIndex: 'Epic' }
        ];
        _.each(that.keys,function(key,i) {
            fields.push(key);
            columns.push({text:that.columnKeys[i],dataIndex:key,width:40, renderer: that._cellRenderer });
        });
        
        console.log("fields",fields);
        console.log("columns",columns);
        
        Ext.create('Ext.data.Store', {
            storeId:'ss',
            fields: fields,
            data:{'items': summary },
            proxy: {
                type: 'memory',
                reader: {
                    type: 'json',
                    root: 'items'
                }
            }
        });
        
        container.add( { 
            xtype : 'gridpanel',
            title: 'Summary',
            store: Ext.data.StoreManager.lookup('ss'),
            columns: columns
        });
    
    }
    ,
    _createSummaryRecord: function(theme,epic) {
        
        var that = this;
        var rec = { Theme : theme, Epic : epic };
        
        _.each(that.keys, function(key) {
            rec[key] = 0;  
        });
        
        return rec;
    }
    ,
    _runQuery : function(cb,typeName,query,fetch) {
    
    	var qr = {
			Results : []	
		};
		
		var count = 1-200;
		var app = this;
		var process = function() {
			count += 200;
			
			console.log("fetch",fetch);
	
			Ext.Ajax.request({
				method: 'GET',
				url: "https://rally1.rallydev.com/slm/webservice/1.39/"+typeName+".js",
				params: {
					workspace : app.context.getWorkspace()._ref,
					project   : app.context.getProject()._ref,
					projectScopeDown: true,
					pagesize: 200,
					start: count,
                    fetch: fetch,
					query: query
				},
				success: function(res) {
					//console.log("res",res);
					res = JSON.parse(res.responseText);
	                      console.log("res",res);
					qr.Results = qr.Results.concat(res.QueryResult.Results);
					//console.log("qr.results",qr.Results);
					//if (res.QueryResult.TotalResultCount >= qr.Results.length) {
					if (res.QueryResult.Results.length < 200) {
						cb(qr,app);
					} else {
						process();
					}
				}
			});
		}
		
		process();
	}
    
    });