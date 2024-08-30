
module.exports = async (req, res) => {

    const projectId = 'affable-seat-433116-u6';

    const userPrompt = req.body.message;
    const chatHistory = req.body.history;

    const { VertexAI } = require('@google-cloud/vertexai');
    const axios = require("axios");    

    async function search() {        
        // custom RAG
        const response = await axios.post(
            `https://gcp-chatbot-vectordb-g5vgkh3bjq-uc.a.run.app/retrieve`,{
                'query': userPrompt,                    
            },
            {
                headers: {                    
                    'Content-Type': 'application/json'
                },
                body: {
                    'query': userPrompt,                    
                },
                params: {
                    'query': userPrompt,
                }
            });

        console.log(response);        
        const results = response.data.snippets;

        let fullContent = "";
        for (const result of results) {            
            try {                
                fullContent = fullContent.concat(result);
            } catch (e) {
                fullContent = fullContent.concat("No data found!");
                console.error(e);
            }
        }
        console.log(fullContent);
        return fullContent;
    }

    const context = await search();
    let systemPrompt = `You are an AI chatbot for the RIDE, an MBTA paratransit service. You will help customer service representatives respond to user complaints and queries.
    Answer questions based on your knowledge and nothing more. If you are unable to decisively answer a question, provide whatever information you have, and then direct them to customer service.
    Do not make up information outside of your given information.
    Customer service is needed if it is something you cannot answer. Requests for fare history require customer service, as do service complaints like a rude driver or late pickup.
    Highly-specific situations will also require customer service to step in. Remember that RIDE Flex and RIDE are not the same service. 

    Phone numbers:
    TRAC (handles scheduling/booking, trip changes/cancellations, anything time-sensitive): 844-427-7433 (voice/relay) 857-206-6569 (TTY)
    Mobility Center (handles eligibility questions, renewals, and changes to mobility status): 617-337-2727 (voice/relay)
    MBTA Customer support (handles all other queries): 617-222-3200 (voice/relay)

    Please use this information to respond as thoroughly and completely as you can (long answers are good, use as much information as you have), and format your answers when possible.
    Remember, verbosity is good. This is information you have available to use:
    Knowledge: ${context}`;

    const vertexAI = new VertexAI({ project: projectId, location: 'us-central1' });

    const textModel = 'gemini-1.5-flash';

    // Instantiate Gemini models
    const generativeModel = vertexAI.getGenerativeModel({
        model: textModel,
        generationConfig: { maxOutputTokens: 2048, temperature: 0.01 },
        systemInstruction: {
            role: 'system',
            parts: [{ text: systemPrompt }]
        },
    });

    function assembleHistory(history) {
        let assembledHistory = []
        history.forEach(element => {
            if (element.role) {
                if (element.role == "user") {
                    assembledHistory.push({ role: 'user', parts: [{ text: element.content }] })
                } else if (element.role == "chatbot") {
                    assembledHistory.push({ role: 'model', parts: [{ text: element.content }] })
                }
            }
        });
        return assembledHistory;
    }

    async function streamGenerateContent(prompt) {

        let parsedHistory = [];

        try {
            // parsedHistory = JSON.parse(chatHistory);
            parsedHistory = assembleHistory(chatHistory);
        } catch (e) {
            console.error("Could not parse history!")
            console.error(e);
        }

        const request = {
            contents: [...parsedHistory, { role: 'user', parts: [{ text: prompt }] }],
        };
        const streamingResult = await generativeModel.generateContentStream(request);
        for await (const item of streamingResult.stream) {
            res.write(item.candidates[0].content.parts[0].text
            )
        }
        const aggregatedResponse = await streamingResult.response;
        console.log('aggregated response: ', JSON.stringify(aggregatedResponse));
    };

    await streamGenerateContent(userPrompt)

    res.end();

};