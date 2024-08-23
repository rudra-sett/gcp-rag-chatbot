
module.exports = async (req, res) => {
    

    const projectId = 'affable-seat-433116-u6';
    const location = 'global';              // Options: 'global', 'us', 'eu'
    const collectionId = 'default_collection';     // Options: 'default_collection'
    const dataStoreId = 'ride-data_1724179572038_gcs_store'       // Create in Cloud Console
    const servingConfigId = 'default_serving_config';      // Options: 'default_config'
    
    const userPrompt = req.body.message;
    const chatHistory = req.body.history;

    const { SearchServiceClient } = require('@google-cloud/discoveryengine');
    const { VertexAI } = require('@google-cloud/vertexai');

    // For more information, refer to:
    // https://cloud.google.com/generative-ai-app-builder/docs/locations#specify_a_multi-region_for_your_data_store
    const apiEndpoint =
        location === 'global'
            ? 'discoveryengine.googleapis.com'
            : `${location}-discoveryengine.googleapis.com`;

    // Instantiates a client
    const client = new SearchServiceClient({ apiEndpoint: apiEndpoint });

    async function search() {
        // The full resource name of the search engine serving configuration.        
        // You must create a search engine in the Cloud Console first.
        const name = client.projectLocationCollectionDataStoreServingConfigPath(
            projectId,
            location,
            collectionId,
            dataStoreId,
            servingConfigId
        );

        const request = {
            pageSize: 5,
            query: userPrompt,
            servingConfig: name,
            queryExpansionSpec: { condition: "AUTO" },
            spellCorrectionSpec: { mode: "AUTO" },
            contentSearchSpec: {
                extractiveContentSpec: {
                    maxExtractiveSegmentCount: 1
                }
            }
        };

        const IResponseParams = {
            ISearchResult: 0,
            ISearchRequest: 1,
            ISearchResponse: 2,
        };

        // console.log(request);

        // Perform search request
        const response = await client.search(request, {
            // Warning: Should always disable autoPaginate to avoid iterate through all pages.
            //
            // By default NodeJS SDK returns an iterable where you can iterate through all
            // search results instead of only the limited number of results requested on
            // pageSize, by sending multiple sequential search requests page-by-page while
            // iterating, until it exhausts all the search results. This will be unexpected and
            // may cause high Search API usage and long wait time, especially when the matched
            // document numbers are huge.
            autoPaginate: false,
        });

        // console.log(response);
        const results = response[IResponseParams.ISearchResult];

        let fullContent = "";
        for (const result of results) {
            // console.log(result.document.derivedStructData.fields)
            try {
                fullContent = fullContent.concat(result.document.derivedStructData.fields.extractive_segments.listValue.values[0].structValue.fields.content.stringValue)
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
    Answer questions based on your knowledge and nothing more. If you are unable to decisively answer a question, direct them to customer service. Do not make up information outside of your given information.
    Customer service is needed if it is something you cannot answer. Requests for fare history require customer service, as do service complaints like a rude driver or late pickup.
    Highly-specific situations will also require customer service to step in. Remember that RIDE Flex and RIDE are not the same service. 
    Phone numbers:
    TRAC (handles scheduling/booking, trip changes/cancellations, anything time-sensitive): 844-427-7433 (voice/relay) 857-206-6569 (TTY)
    Mobility Center (handles eligibility questions, renewals, and changes to mobility status): 617-337-2727 (voice/relay)
    MBTA Customer support (handles all other queries): 617-222-3200 (voice/relay)
    ${context}`;  

    const vertexAI = new VertexAI({ project: projectId, location: 'us-central1' });

    const textModel =  'gemini-1.5-pro';

    // Instantiate Gemini models
    const generativeModel = vertexAI.getGenerativeModel({
        model: textModel,        
        generationConfig: { maxOutputTokens: 2048 },
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
        } catch (e){
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
