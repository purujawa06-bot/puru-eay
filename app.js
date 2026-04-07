const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.render('index');
});

app.post('/chat', async (req, res) => {
    const userPrompt = req.body.prompt;
    const userId = "user-session-001"; // Static for demo

    try {
        const response = await axios.post('https://puruboy-api.vercel.app/api/ai/puruai', {
            userid: userId,
            prompt: userPrompt,
            model: "puruboy-flash",
            system: "Kamu adalah AI asisten dari PuruBoy yang ramah."
        });

        const aiResponse = response.data.result[0].parts[0].text;

        // Return HTML partials for HTMX to swap
        res.send(`
            <div class="flex flex-col mb-4 items-end">
                <div class="bg-blue-600 text-white rounded-lg py-2 px-4 max-w-[80%]">
                    ${userPrompt}
                </div>
            </div>
            <div class="flex flex-col mb-4 items-start">
                <div class="bg-gray-700 text-gray-100 rounded-lg py-2 px-4 max-w-[80%]">
                    ${aiResponse}
                </div>
            </div>
        `);
    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).send('<div class="text-red-500">Error: Gagal menghubungi AI API.</div>');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});