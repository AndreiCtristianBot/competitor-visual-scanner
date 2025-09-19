const form = document.getElementById('analyze-form');
const urlsInput = document.getElementById('urls-input');
const outputDiv = document.getElementById('output');
const loadingDiv = document.getElementById('loading');

form.addEventListener('submit', async (e) => {
    e.preventDefault(); // Oprește reîncărcarea paginii

    const urls = urlsInput.value;
    if (!urls) {
        alert('Te rog introdu cel puțin un URL.');
        return;
    }

    // --- LOGICA NOUĂ, EXPLICITĂ ---
    loadingDiv.classList.remove('hidden'); // APRINDE indicatorul
    outputDiv.innerHTML = '';              // Golește rezultatele vechi
    outputDiv.classList.add('hidden');     // STINGE (ascunde) containerul de rezultate

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ urls: urls }),
        });

        const results = await response.json();

        if (response.status !== 200) {
            throw new Error(results.error);
        }

        // --- CONSTRUCȚIA REZULTATELOR (VERSIUNEA CORECTATĂ) ---
        results.forEach(result => {
            let resultHtml;
            // Verificăm dacă a apărut o eroare specifică pentru acest URL
            if (result.error) {
                resultHtml = `
                    <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-md">
                        <h3 class="font-bold text-lg break-all mb-2">${result.url}</h3>
                        <p class="font-semibold">Analiza a eșuat</p>
                        <p class="text-sm">${result.error}</p>
                    </div>
                `;
            } else {
                // Template-ul nou, care afișează procentajele și suprafața
                resultHtml = `
                    <div class="bg-white p-4 rounded-lg shadow-md">
                        <h3 class="font-bold text-lg break-all mb-2">${result.url}</h3>
                        <h4 class="font-semibold text-gray-700 mt-4">Raport de Accesibilitate (Contrast Culori)</h4>
                        ${
                            (result.accessibility && result.accessibility.contrastIssues.length > 0)
                            ? `<div class="mt-2 space-y-3">
                                ${result.accessibility.contrastIssues.map(issue => `
                                    <div class="border border-red-200 bg-red-50 p-3 rounded-lg">
                                        <p class="text-sm font-semibold text-red-800">Problemă de contrast detectată:</p>
                                        <div class="my-2 p-2 rounded text-center text-lg" style="background-color: ${issue.bgColor}; color: ${issue.textColor};">
                                        "${issue.text}"
                                        </div>
                                        <div class="text-xs text-gray-600 space-y-1">
                                        <p><strong>Contrast:</strong> <span class="font-mono text-red-700 font-bold">${issue.contrastRatio}:1</span></p>
                                        <p><strong>Recomandat (${issue.wcagLevel}):</strong> <span class="font-mono text-green-700 font-bold">${issue.requiredRatio}</span></p>
                                        <p class="italic mt-1">Acest text este dificil de citit pentru persoanele cu deficiențe de vedere.</p>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>`
                            : `<div class="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <p class="text-sm font-semibold text-green-800">Felicitări! Nu au fost găsite probleme majore de contrast al culorilor.</p>
                            </div>`
                        }
                        <h4 class="font-semibold text-gray-700 mt-4">Culori de Fundal (după suprafața vizibilă)</h4>
                        <div class="space-y-2 mt-2">
                            ${result.backgrounds.map(item => `
                                <div class="w-full bg-gray-200 rounded-full h-6 relative overflow-hidden">
                                    
                                    <div class="h-6 rounded-full absolute top-0 left-0" style="width: ${item.percentage}%; background-color:${item.color};"></div>
                                    
                                    <div class="absolute top-0 left-0 w-full h-full flex items-center justify-between px-2">
                                        <span class="text-xs font-bold ${isColorDark(item.color) ? 'text-white' : 'text-black'}">${item.color}</span>
                                        <span class="text-xs font-bold text-gray-700">${item.percentage}%</span>
                                    </div>
                                </div>
                                `).join('')}
                        </div>
                        <h4 class="font-semibold text-gray-700 mt-4">Culori de Text (după relevanță)</h4>
                        <ul class="list-none mb-4">
                            ${result.colors.map(item => `
                                <li class="flex items-start mb-2">
                                    <div class="w-5 h-5 rounded-full mr-2 border border-gray-300 flex-shrink-0" style="background-color:${item.color};"></div>
                                    <div>
                                        <span class="font-mono text-sm font-bold">${item.color}</span>
                                        <div class="text-xs text-gray-500 italic truncate" title="${item.elements.join(' ')}">
                                            Folosit de: ${item.elements.join(', ')}
                                        </div>
                                    </div>
                                </li>
                            `).join('')}
                        </ul>
                        
                        <h4 class="font-semibold text-gray-700 mt-4">Fonturi Principale</h4>
                        <ul class="list-none">
                            ${result.fonts.map(font => `<li class="text-sm">${font.font} (${font.count} apariții)</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            outputDiv.innerHTML += resultHtml;
        });

        // Adaugă și funcția ajutătoare isColorDark la finalul fișierului script.js, dacă nu ai făcut-o deja
        function isColorDark(hexColor) {
            if (!hexColor.startsWith('#')) return false;
            const hex = hexColor.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance < 0.5;
        }

    } catch (error) {
        alert(`A apărut o eroare: ${error.message}`);
    } finally {
        // --- CURĂȚENIA FINALĂ ---
        loadingDiv.classList.add('hidden');     // STINGE indicatorul
        outputDiv.classList.remove('hidden'); // APRINDE containerul cu noile rezultate
    }
});