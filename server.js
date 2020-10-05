//create a web application that uses the express frameworks and socket.io to communicate via http (the web protocol)
var express = require('express');
const { tmpdir } = require('os');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

//the rate the server updates all the clients, 
//10fps to simulate a major lag and introduce predictive logic
//setInterval works in milliseconds
var UPDATE_TIME = 1000 / 10;
var BULLET_SPEED = 150;
var BULLET_DURATION = 0.8;
var PLAYER_SIZE = 20;
var PLAYER_CANNON_SIZE = 4;
//keep track of the time elapsed between updates for the physics based math
var lastUpdate = Date.now();
var deltaTime = 0;

var deadCount = 0;
var playerCount = 0;
//Gameplay variables
//size of canvas
var WIDTH = 800;
var HEIGHT = 500;
var WRAP_MARGIN = 20;
var ROTATION_SPEED = 200;
var MAX_VELOCITY = 10;
var THRUST = 10;
var FRICTION = 0.98;

//We want the server to keep track of the whole game state and the clients just to send updates
var gameState = {
    players: {},
    bullets: {},
    over: false,
}

//when a client connects serve the static files in the public directory ie public/index.html
app.use(express.static('public'));

//when a client connects 
io.on('connection', function (socket) {
    //this appears in the server's terminal
    console.log('A user connected');

    //this is sent to the client upon connection
    socket.emit('message', 'Hello welcome!');

    //create player object
    //randomize initial position and set velocity to 0
    PlayerSetup(socket.id);
    playerCount++;

    //when I receive an update from a client, update the game state
    socket.on('clientUpdate', function (controls) {
        //I don't want to calculate positions here since clients may send updates at different times
        //so I just save the latest control state and do all the math in the general update function below
        gameState.players[socket.id].controls = controls;
    });

    //Received when a client shoots
    socket.on('playerShot', function () {
        p = gameState.players[socket.id];

        projX = p.x + Math.cos(radians(p.angle)) * PLAYER_CANNON_SIZE;
        projY = p.y + Math.sin(radians(p.angle)) * PLAYER_CANNON_SIZE;

        gameState.bullets[socket.id]  = {
            x: projX,
            y: projY,
            angle: p.angle,
            vX: 0,
            vY: 0,
            lifeSpan: BULLET_DURATION,
        }
    });



    //when a client disconnects I have to delete its player object
    //or I would end up with ghost players
    socket.on('disconnect', function () {
        console.log("User disconnected - destroying player " + socket.id);
        //delete the player object
        delete gameState.players[socket.id];
        playerCount--;
        console.log("There are now " + Object.keys(gameState.players).length + " players");
    });


});//end of connected client


//setInterval calls the function at the given interval in time
//the server sends the whole game state to all players
//this is where I calculate all the velocities and positions at the same time
setInterval(function () {

    //deltaTime is the time in seconds between updates
    //just use it as multiplier to make movements "framerate" independent
    var now = Date.now();
    deltaTime = (now - lastUpdate) / 1000;
    lastUpdate = now;

    //iterate through the players
    for (var playerId in gameState.players) {

        var p = gameState.players[playerId];

        if (p.controls != null) {

            //rotate left and right
            if (p.controls.left)
                p.angle -= ROTATION_SPEED * deltaTime;

            if (p.controls.right)
                p.angle += ROTATION_SPEED * deltaTime;

            //add thrust or inverst
            if (p.controls.up)
                p.thrust = THRUST;
            else if (p.controls.down)
                p.thrust = -THRUST;
            else {
                p.thrust = 0;
                //slow down
                p.vX *= FRICTION;
                p.vY *= FRICTION;
            }

            //update velocity and position
            p.vX += Math.cos(radians(p.angle)) * p.thrust * deltaTime;
            p.vY += Math.sin(radians(p.angle)) * p.thrust * deltaTime;

            //limit speed
            p.vX = constrain(p.vX, -MAX_VELOCITY, MAX_VELOCITY);
            p.vY = constrain(p.vY, -MAX_VELOCITY, MAX_VELOCITY);

            //BEFORE APPLYING, if we are hitting another player, bounce off
            for (var player2Id in gameState.players) {
                if (playerId == player2Id) {
                    continue;
                }
                var p2 = gameState.players[player2Id];

                if(p2.dead) {
                    continue;
                }

                if (Math.abs(p2.x - p.x) < PLAYER_SIZE && Math.abs(p2.y - p.y) < PLAYER_SIZE) {
                    p.vX = -p.vX;
                    p.vY = -p.vY;
                }     
            }

            //update position
            p.x += p.vX;
            p.y += p.vY;

            //screen wrap
            if (p.x > WIDTH + WRAP_MARGIN)
                p.x = -WRAP_MARGIN;

            if (p.x < -WRAP_MARGIN)
                p.x = WIDTH + WRAP_MARGIN;

            //screen wrap
            if (p.y > HEIGHT + WRAP_MARGIN)
                p.y = -WRAP_MARGIN;

            if (p.y < -WRAP_MARGIN)
                p.y = HEIGHT + WRAP_MARGIN;
        }
    }

    //Iterate through bullets

    for( var bulletId in gameState.bullets) {
        b = gameState.bullets[bulletId];

        b.lifeSpan -= deltaTime;

        //If not depleted, simulate
        if(b.lifeSpan > 0) {

            b.vX += Math.cos(radians(b.angle)) * BULLET_SPEED * deltaTime;
            b.vY += Math.sin(radians(b.angle)) * BULLET_SPEED * deltaTime;
            //update position
            b.x += b.vX;
            b.y += b.vY;

            //screen wrap
            if (b.x > WIDTH + WRAP_MARGIN)
                b.x = -WRAP_MARGIN;

            if (b.x < -WRAP_MARGIN)
                b.x = WIDTH + WRAP_MARGIN;

            //screen wrap
            if (b.y > HEIGHT + WRAP_MARGIN)
                b.y = -WRAP_MARGIN;

            if (b.y < -WRAP_MARGIN)
                b.y = HEIGHT + WRAP_MARGIN;

                for (var playerId in gameState.players) {
                    var p = gameState.players[playerId];

                    if (Math.abs(b.x - p.x) < PLAYER_SIZE && Math.abs(b.y - p.y) < PLAYER_SIZE && b.lifeSpan < BULLET_DURATION - 0.2) {
                        p.dead = true;
                        updateDead();
                        delete gameState.bullets[bulletId];
                    }
                }
            
        }
        //If depleted, die
        else { 
            delete gameState.bullets[bulletId];
        }
    }

    io.sockets.emit('state', gameState);
}, UPDATE_TIME);

//listen to the port 3000
http.listen(3000, function () {
    console.log('listening on *:3000');
});

//just random range
function random(min, max) {
    return Math.random() * (max - min) + min;
}

function print(m) {
    console.log(m);
}

function updateDead() {
    deadCount++;
    if(deadCount >= playerCount - 1) {
        console.log("Everybody die");
        gameState.over = true;
        setTimeout( () => { 
            ResetGame();
            gameState.over = false;
        }, 3000);
    }
}

function ResetGame() {
    for( var pID in gameState.players) {
        PlayerSetup(pID);
    }
    deadCount = 0;
}

function PlayerSetup(id) {
    gameState.players[id] = {
        x: random(0, WIDTH),
        y: random(0, HEIGHT),
        angle: 0,
        thrust: 0,
        vX: 0,
        vY: 0,
        dead: false,
    }
}

function radians(degrees) {
    return degrees * (Math.PI / 180);
}

function constrain(n, min, max) {
    return Math.min(Math.max(n, min), max);
};
