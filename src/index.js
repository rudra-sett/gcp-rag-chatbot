const express = require('express');
const cors = require('cors');
const app = express();

const chat = require('./routes/chat');


app.use(express.json());
// app.use(express.static(__dirname + '/static'));
app.use(cors());

app.post('/chat', chat);

app.listen(8080, () => console.log('Listening on port 8080'));

const gracefulShutdown = () => {    
    process.exit();
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Sent by nodemon
