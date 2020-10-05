//check README.md for more information

/// <reference path="TSDef/p5.global-mode.d.ts" />

//create a socket connection
var socket;
var pointer;

//Vals for Shooter
var shotCooldown;

var WIDTH = 800;
var HEIGHT = 500;
//this has to be the same as UPDATE_TIME on server
var SERVER_UPDATE_TIME = 1000 / 10;

var gameState = {};
var lastServerUpdate = 0;

//setup is called when all the assets have been loaded
function preload() {
    //load the image and store it in pointer
    pointer = loadImage('assets/pointer.png');
}

function setup() {
    //create a canvas
    createCanvas(WIDTH, HEIGHT);
    //I create socket but I wait to assign all the functions before opening a connection
    socket = io({
        autoConnect: false
    });

    textSize(60);
    strokeWeight(0.5);
    textAlign(CENTER, CENTER);


    //detects a server connection 
    socket.on('connect', onConnect);
    //handles the messages from the server, the parameter is a string
    socket.on('message', onMessage);
    //copy game state from server
    socket.on('state', function (s) {
        //copy the state locally and the time of the update
        lastServerUpdate = Date.now();
        gameState = s
    });

    socket.open();

}

//note that the client doesn't do any important calculation, it only keeps track of the input and renders the state
function draw() {

    //paint it black
    background(0);

    //render the game state

    //iterate through the players
    for (var playerId in gameState.players) {
        var p = gameState.players[playerId];

        if(p.dead)
            continue;
        /*
        predict the position based on the last recorded velocity and the last time
        I got a server update, in most of the cases it will approximate the position
        I the prediction is incorrect no big deal, these values will be overwritten
        by the next server update
        */

        var now = Date.now();
        var timeSinceUpdate = (now - lastServerUpdate);

        //0-1 variable for lerping
        //0 the server update just happened
        //1 the next server update is about to happen 
        var t = timeSinceUpdate / SERVER_UPDATE_TIME;

        //calculate what the position would be if the object maintained the same speed
        var predictedX = p.x + p.vX;
        var predictedY = p.y + p.vY;

        //interpolate the position between the last update and the predicted position
        //the closer to the next update, the closer the t to 1, the closer to predictedX
        var interX = lerp(p.x, predictedX, t);
        var interY = lerp(p.y, predictedY, t);

        //draw the sprite
        if(playerId == socket.id) {
            fill(0,255,0);
        }
        else {
            fill(255);
        }
        //draw from center
        rectMode(CENTER);

        //in order to rotate I have to use the transformation matrix
        push();
        translate(interX, interY);
        rotate(radians(p.angle));

        
        rect(0, 0, 10, 20);
        if(shotCooldown && playerId == socket.id) {
            fill(100,0,0);
        }
        rect(2, 0, 15, 6);
        pop();
    }

    //iterate through the players
    for (var bulletId in gameState.bullets) {

        var b = gameState.bullets[bulletId];

        //var now = Date.now();
        //var timeSinceUpdate = (now - lastServerUpdate);

        //0-1 variable for lerping
        //0 the server update just happened
        //1 the next server update is about to happen 
        //var t = timeSinceUpdate / SERVER_UPDATE_TIME;

        //calculate what the position would be if the object maintained the same speed
        var predictedX = b.x + b.vX;
        var predictedY = b.y + b.vY;

        //var interX = lerp(b.x, predictedX, t);
        //var interY = lerp(b.y, predictedY, t);

        //draw the sprite
        fill(255, 0, 100);
        //draw from center
        rectMode(CENTER);
        

        //in order to rotate I have to use the transformation matrix
        push();
        noStroke();
        translate(predictedX, predictedY);
        rotate(radians(b.angle));
        
        rect(0, 0, 10, 6);
        pop();
    }

    
    if(gameState.over) {
        fill(255);
        if(!gameState.players[socket.id].dead) {
            text('YOU WON', WIDTH/2, HEIGHT/2);
        }
        else {
            text('YOU LOST', WIDTH/2, HEIGHT/2);
        }
    }
    
    //WASD keycodes for continuous input
    //https://keycode.info/
    if(gameState.players && gameState.players[socket.id] && !gameState.players[socket.id].dead) {
        socket.emit('clientUpdate', {
            left: keyIsDown(65),
            right: keyIsDown(68),
            up: keyIsDown(87),
            down: keyIsDown(83)
        });
    }


    if(!gameState.over && keyIsDown(32) && !shotCooldown) {
        shotCooldown = true;
        socket.emit('playerShot');
        setTimeout( () => { shotCooldown = false;}, 2000);
    }
}



//connected to the server
function onConnect() {
    if (socket.id) {
        console.log("Connected to the server");
        socket.emit('newPlayer', { x: mouseX, y: mouseY });
    }
}

//a message from the server
function onMessage(msg) {
    if (socket.id) {
        console.log("Message from server: " + msg);
    }
}