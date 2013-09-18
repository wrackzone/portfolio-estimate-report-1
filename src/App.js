var app;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items: [
    {
        xtype: 'container',
        itemId: 'selectButton',
        columnWidth: 1,
        items : [
            {
                xtype : 'rallymultiobjectpicker',
                modelType : 'tag',
                listeners : {
                    collapse : function( field, eOpts ) {
                        console.log(field.getValue());
                        app.createTable(field.getValue());
                    },
                    scope : this
                }
            }
        ]
    }
    ,
    {
        xtype: 'container',
        itemId: 'grid',
        columnWidth: 1
    }

    ],
    
    launch: function() {
        app = this;
        this.createTable();
    },
    
    createTable : function(tags) {
        
        var that = this;
        that.down("#grid").removeAll();
        
        that.priorities = ["None","P1 - Baseline","P2 - Target","P3 - Stretch","P4 - Out of Release"];
        that.sizes = ["None","Free","XXS","XS","S","M","L","XL","XXL"];     
        that.keys = [];
        that.columnKeys = [];
        
        _.each(that.priorities,function(priority) {
            _.each(that.sizes,function(sz) {
                that.keys.push(priority+"-"+sz);
                that.columnKeys.push(priority.substring(0,2)+"-"+sz);
            });
        });
        
        // filter by tags if specified
        var themeQuery = "";
        if ( !_.isUndefined(tags) && tags.length > 0  ) {
            var q = that.createTagsQuery(tags);
            themeQuery = q.toString();
            console.log("query=",themeQuery);
        }

        that._runQuery( function(results) { 
            var resultThemes = results.Results;
            console.log("Themes:",resultThemes.length);
            
            that._runQuery( function(results) { 
                var epics = results.Results;
                
                that._runQuery( function(results) {
                    // preprocess
                    _.each( results.Results, function(result) {
                        
                        result.Priority = ( result.Priority != null ? result.Priority : "None");
                        result.Estimate = ( result.PreliminaryEstimate != null ? result.PreliminaryEstimate.Name : "None");
                        result.Epic = ( result.Parent != null ? result.Parent.FormattedID + ":" + result.Parent.Name : "None");
                        
                        // find the theme for the initiative
                        if (result.Parent != null) {
                            var init = result.Parent;
                            // find the initiative
                            var init = _.find(epics, function(i) { return i.ObjectID == result.Parent.ObjectID });
                            if (init != null) {
                                if (init.Parent !=null) {
                                    result.Theme = init.Parent.FormattedID + ":" + init.Parent.Name;
                                }
                            } 
                        }
                        if (result.Theme == undefined || result.Theme == null)
                            result.Theme = "None";
                    });

                    var ss = [];
                    var r = results.Results;
                    var themes = _.groupBy( r, "Theme" );

                    _.each( _.keys(themes), function(theme) {
                        var themeTotal = that._createSummaryRecord(theme,"Total");
                        //var epics = _.groupBy( themes[theme], "Epic" );
                        var epics = _.groupBy( themes[theme], "Epic" );
                        _.each( _.keys(epics), function(epic) {
                            var priorityBuckets = _.groupBy( epics[epic], "Priority");
                            _.each( _.keys(priorityBuckets), function(priority) {
                                var sizeBuckets = _.groupBy( priorityBuckets[priority], "Estimate");
                                //console.log("sizeBuckets:",sizeBuckets);
                                _.each( _.keys(sizeBuckets), function( sizeBucket) {
                                    // find the summary record
                                    var rec = _.find(ss, function(s) { return s.Theme == theme && s.Epic == epic});
                                    if (rec==null) {
                                        rec = that._createSummaryRecord(theme,epic);
                                        ss.push(rec);
                                    }
                                    rec[priority+"-"+sizeBucket] = sizeBuckets[sizeBucket].length;
                                    rec["Total"] = rec["Total"] + sizeBuckets[sizeBucket].length;
                                    // update theme totals
                                    themeTotal[priority+"-"+sizeBucket] = themeTotal[priority+"-"+sizeBucket] + sizeBuckets[sizeBucket].length;
                                    themeTotal["Total"] = themeTotal["Total"] + sizeBuckets[sizeBucket].length;
                                });
                                
                            });
                        });
                        ss.push(themeTotal);
                    });
                    
                    console.log("summary rows:",ss.length);
                    // filter to only the themes in the results
                    ss = _.filter(ss, function (s) {
                        return _.find( resultThemes, function(rt) {
                            if ( s.Theme == rt.FormattedID + ":" + rt.Name || s.Theme == "None" )
                                return true;
                            else {
                                return false;
                            }
                        });
                    });
                    console.log("filtered:",ss.length);
                    that._createStore(ss);                    
                    
                }, "PortfolioItem/Feature","","FormattedID,Parent,ObjectID,Name,Value,PreliminaryEstimate,Priority");
            }, "PortfolioItem/Epic","","FormattedID,Parent,ObjectID,Name,Value,PreliminaryEstimate");    
        }, "PortfolioItem/Theme",themeQuery,"FormattedID,Parent,ObjectID,Name,Value,PreliminaryEstimate","FormattedID");
    },
    
    _cellRenderer : function(value) {
        return ( value == 0 ? "" : value);
    }
    ,
    _createStore: function(summary) {
        
        var that = this;
        var container = this.down("#grid");
        var fields = ['Theme',"Epic","Total"];
        var columns = [
                { text: 'Theme',  dataIndex: 'Theme' },
                { text: 'Epic', dataIndex: 'Epic' },
                { text: 'Total', dataIndex: 'Total',width:40 }
        ];
        _.each(that.keys,function(key,i) {
            fields.push(key);
            columns.push({text:that.columnKeys[i],dataIndex:key,width:40, renderer: that._cellRenderer, align : "center" });
        });
        
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
            autoScroll : true,
            height : 500,
            title: 'Summary',
            store: Ext.data.StoreManager.lookup('ss'),
            columns: columns,
            columnLines : true,
            viewConfig: {
                getRowClass: function(record, rowIndex, rowParams, store){
                    if (record.get("Epic") == "Total") {
                        return "total-row";
                    }
                }
            }
        });
    
    }
    ,
    _createSummaryRecord: function(theme,epic) {
        
        var that = this;
        var rec = { Theme : theme, Epic : epic, Total : 0 };
        
        _.each(that.keys, function(key) {
            rec[key] = 0;  
        });
        
        return rec;
    },

    createTagsQuery : function(tags) {
        var filter;
        _.each(tags, function(tag,i) {
            var f = Ext.create('Rally.data.QueryFilter', { property: 'Tags.Name', operator: '=', value: tag.data._refObjectName });
            filter = i == 0 ? f : filter.and(f);
        });
        return filter;
    },

    _runQuery : function(cb,typeName,query,fetch,order) {
    
    	var qr = {
			Results : []	
		};
		
		var count = 1-200;
		var app = this;
		var process = function() {
			count += 200;
			
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
					query: query,
					order : order
				},
				success: function(res) {
					res = JSON.parse(res.responseText);
					qr.Results = qr.Results.concat(res.QueryResult.Results);
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
