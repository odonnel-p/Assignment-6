var margin = {t:50,l:50,b:50,r:50},
    width = document.getElementById('map').clientWidth-margin.l-margin.r,
    height = document.getElementById('map').clientHeight-margin.t-margin.b;

var map = d3.select('.canvas')
    .append('svg')
    .attr('width',width+margin.l+margin.r)
    .attr('height',height+margin.t+margin.b)
    .append('g').attr('class','map')
    .attr('transform',"translate("+margin.l+","+margin.t+")");

//Set up projection and geo path generator
var projection = d3.geo.albersUsa()
	.translate([width/2, height/2]);

var path = d3.geo.path()
	.projection(projection);

//lookup table for state population
var popByState = d3.map();

//Scales
var scaleR = d3.scale.sqrt().range([5,130]),
    scaleColor = d3.scale.linear().domain([70,90]).range(['white','red']);

//import data
queue()
	.defer(d3.json, "data/gz_2010_us_040_00_5m.json")
    .defer(d3.csv, "data/2014_state_pop.csv", parseData)
	.await(function(err, states, pop) {

        //mine data to complete scales - set max population to the radius scale dimension
        var maxPop = d3.max(pop);
        scaleR.domain([0, maxPop]);

        //construct a new array of data
        var data = states.features.map(function (d) {
            var centroid = path.centroid(d); //provides two numbers [x,y] indicating the screen coordinates of the state
            //Puerto Rico returns NaN, sends error to the console. Also, something wrong with UT data - no fill color assigned.

            return {
                fullName: d.properties.NAME,
                state: d.properties.STATE,
                x0: centroid[0],
                y0: centroid[1],
                x: centroid[0],
                y: centroid[1],
                r:scaleR(popByState.get(d.properties.STATE).pop)
            }
        });
        console.log(data);

        //bind nodes to the data array, using the property d.state (?)
        var nodes = map.selectAll('.state')
            .data(data, function (d) {
                return d.state
            });

        //create an enter group of DOM elements to match nodes, and put a group inside each one
        var nodesEnter = nodes.enter()
            .append('g')
            .attr('class', 'state');
        nodes.exit().remove();

        //draw a circle to represent each node, using the population stored in the data array.
        // Scale using the radius scale function, color according to population
        nodesEnter
            .append('circle')
            .attr('r', function (d) {
                var pop = (popByState.get(d.state)).pop;
                return scaleR(pop);
            })
            .style('fill', function (d) {
                var pct18Plus = (popByState.get(d.state)).pop18plus;
                return scaleColor(pct18Plus);
            })
            .style('fill-opacity', .7);

        //append a label for each node, which contains the name of the state
        //Textbox present in DOM, but doesn't populate..
        nodesEnter
            .append('text')
            .text(function (d) {
                return d.fullName;
            })
            .attr('text-anchor', 'middle');

        //TODO: create a force layout
        //Create a force layout with no charge or gravity (want all force to come from collision and custom gravity)
        var force = d3.layout.force()
            .size([width, height])
            //?? Readme says that there's not supposed to be a force, but without it the circles don't move.
            //Is there something wrong with the collide function?
            .charge(0)
            .gravity(0);

        //set up collision properties, to run the onForceTick function
        force.nodes(data)
            .on('tick', onForceTick)
            .start();

    //declare the onForceTick function. Uses alpha to track progress of the minimization
    function onForceTick(e) {

        //console.log(e.alpha);

        //move the nodes to the x and y positions calculated for the centroid of each state (x0,y0 are the position values that don't change)
        nodesEnter
            .attr('transform', function (d) {
                //console.log(d.x0);
                return 'translate(' + d.x + ',' + d.y + ')';
            });

        var q = d3.geom.quadtree(data),
            i = 0,
            n = data.length;

        while (++i < n) {
            q.visit(collide(data[i]));
        }

        //update nodes and tick values each time the function is run - attr that change (x, y)
        nodesEnter//e.alpha from .1-0; at first tick, gravity receives e.alpha*.1
            .each(gravity(e.alpha * .1))
            .attr('transform', function (d) {
                return 'translate(' + d.x + ',' + d.y + ')';
            });
    }

        function gravity(k){  //returns a function that looks at x0 from data.push and compares to
            //ternary operator in updated code - if #s fall on right side, move grav center, similarly for left side
            //y coord = height/2, so grav center should be at centerpoint of y, regardless of where they fall in x.
            //half gravitate left, half gravitate right. X and y are coordinates of those two gravitational centers.
            //x can be one of 2 values, depending on what x0 is. returns focus.x depending on whether orig circle is on left or righthand side
            //d.y = d.y+{focus.y - d.y) = focus.y
            //want to make all circles gravitate toward center; d.y converge on focus.y, d,x converge on focus.x.
            //want to inch it toward focus.x, y a little at a time; separation between where it is and where it wants to be
            //is d.y.

            //custom gravity: for Assignment 6, want data points to gravitate toward their natural position on the map (data.x, data.y)
            return function(d){
                d.y += (d.y0 - d.y)*k;
                d.x += (d.x0 - d.x)*k;
            }
        }



    });
function parseData(d){
    //Use the parse function to populate the lookup table of states and their populations/% pop 18+

    popByState.set(d.STATE,{
        'pop':+d.POPESTIMATE2014,
        'pop18plus':+d.PCNT_POPEST18PLUS
    });

    return +d.POPESTIMATE2014;
}


function collide(dataPoint){
    //read original data x and y values, store x and y positions twice (presumably so that you can change nx1 and nx2 separately)
    var nr = dataPoint.r + 5,
        nx1 = dataPoint.x - nr,
        ny1 = dataPoint.y - nr,
        nx2 = dataPoint.x + nr,
        ny2 = dataPoint.y + nr;

    return function(quadPoint,x1,y1,x2,y2){
        //check whether the point is equal to the data point input. If so, take the difference between x and y values,
        //and the square root of a sum of squares (pythagorean theorem - does this calculate the difference in radius for the two objects?),
        //and a new radius value that's bigger than the radius of the initial data point.
        if(quadPoint.point && (quadPoint.point !== dataPoint)){
            var x = dataPoint.x - quadPoint.point.x,
                y = dataPoint.y - quadPoint.point.y,
                l = Math.sqrt(x*x+y*y),
                r = nr + quadPoint.point.r;
            //if the radius is smaller than this sum, make the x values slightly bigger for both (why not y values also?)
            if(l<r){
                l = (l-r)/l*.1;
                dataPoint.x -= x*= (l*.05);
                dataPoint.y -= y*= l;
                quadPoint.point.x += (x*.05);
                quadPoint.point.y += y;
            }
        }
        //output the results, so that the x and y values of the new array are bigger than the minimum calculated by the collide function.
        return x1>nx2 || x2<nx1 || y1>ny2 || y2<ny1;
    }
}