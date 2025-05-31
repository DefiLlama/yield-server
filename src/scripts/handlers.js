const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const cron = require('node-cron');


// Get all handler files
const handlersDir = path.join(__dirname, '..', 'handlers');
const handlers = fs.readdirSync(handlersDir)
    .filter(file => file.startsWith('trigger') && file.endsWith('.js'));

function getTimestamp() {
    return new Date().toISOString();
}

function logMessage(message, type = 'INFO') {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}] [${type}] ${message}`);
}

async function runHandlers() {
    const startTime = Date.now();
    logMessage('Starting handlers execution cycle');
    logMessage(`Found ${handlers.length} handlers to execute`);
    
    for (const handlerFile of handlers) {
        const handlerStartTime = Date.now();
        try {
            logMessage(`Starting handler: ${handlerFile}`);
            const handler = require(path.join(handlersDir, handlerFile));
            
            if (typeof handler.handler === 'function') {
                await handler.handler();
                const duration = Date.now() - handlerStartTime;
                logMessage(`Successfully completed: ${handlerFile} (duration: ${duration}ms)`);
            } else {
                logMessage(`Skipping ${handlerFile}: no handler function found`, 'WARN');
            }
        } catch (error) {
            logMessage(`Error in ${handlerFile}: ${error.message}`, 'ERROR');
            logMessage(error.stack, 'ERROR');
        }
    }
    
    const totalDuration = Date.now() - startTime;
    logMessage(`All handlers execution completed (total duration: ${totalDuration}ms)`);
}

// Run the handlers every 30 minutes
cron.schedule('* * * * *', runHandlers);