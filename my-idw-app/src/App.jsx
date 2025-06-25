import React, { useState, useEffect, useRef, useCallback } from 'react';

// Main App component
const App = () => {
    // State to hold the measured data points (latitude, longitude, moisture)
    const [measuredData, setMeasuredData] = useState([
        // Dummy Data for a small field (similar to your 150x150 ft / 45x45m area)
        // These approximate coordinates are for demonstration purposes.
        // They simulate a 5x5 grid for a very small area to show variability.
        // Format: [latitude, longitude, moisture_value]
       
    ]);

    // State to hold the interpolated grid values
    const [interpolatedGrid, setInterpolatedGrid] = useState(null);
    // Ref for the canvas element
    const canvasRef = useRef(null);

    // IDW Parameters
    const idwPower = 2; // Power parameter for IDW (common values: 1, 2)
    const gridResolutionDegrees = 0.00005; // Finer resolution for heatmap
    const bufferDegrees = 0.0001; // Small buffer around min/max coords

    // Function to map a value to a color using a colormap (e.g., Viridis)
    const getColor = (value, minVal, maxVal) => {
        const normalized = (value - minVal) / (maxVal - minVal);
        // Viridis colormap approximation (green-yellow for low, blue-purple for high)
        // For actual Viridis, you'd use a more complex interpolation or lookup table.
        // This is a simple linear interpolation for demonstration.
        const r = Math.floor(255 * (1 - normalized));
        const g = Math.floor(255 * normalized);
        const b = Math.floor(255 * normalized); // Use normalized for blue as well for a more vibrant color
        return `rgb(${r}, ${g}, ${b})`;
    };

    // Inverse Distance Weighting (IDW) calculation function
    const calculateIDW = useCallback(() => {
        if (!measuredData || measuredData.length === 0) {
            setInterpolatedGrid(null);
            return;
        }

        // Extract min/max latitude and longitude from measured data
        const lats = measuredData.map(d => d[0]);
        const lons = measuredData.map(d => d[1]);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minMoisture = Math.min(...measuredData.map(d => d[2]));
        const maxMoisture = Math.max(...measuredData.map(d => d[2]));

        // Define the grid for interpolation
        const gridLats = [];
        for (let lat = minLat - bufferDegrees; lat <= maxLat + bufferDegrees; lat += gridResolutionDegrees) {
            gridLats.push(lat);
        }
        const gridLons = [];
        for (let lon = minLon - bufferDegrees; lon <= maxLon + bufferDegrees; lon += gridResolutionDegrees) {
            gridLons.push(lon);
        }

        const newInterpolatedGrid = Array(gridLats.length).fill(0).map(() => Array(gridLons.length).fill(0));

        // Perform IDW for each point in the grid
        for (let i = 0; i < gridLats.length; i++) {
            for (let j = 0; j < gridLons.length; j++) {
                const currentGridLat = gridLats[i];
                const currentGridLon = gridLons[j];

                let sumWeights = 0;
                let sumWeightedValues = 0;
                let exactMatchFound = false;

                for (let k = 0; k < measuredData.length; k++) {
                    const [dataLat, dataLon, dataMoisture] = measuredData[k];

                    // Calculate Euclidean distance
                    // Approximation for small geographic areas: treat degrees as Cartesian units
                    const dx = dataLon - currentGridLon;
                    const dy = dataLat - currentGridLat;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance === 0) {
                        newInterpolatedGrid[i][j] = dataMoisture;
                        exactMatchFound = true;
                        break; // Found exact match, no need to interpolate
                    }

                    const weight = 1 / Math.pow(distance, idwPower);
                    sumWeights += weight;
                    sumWeightedValues += weight * dataMoisture;
                } // End of k loop

                if (!exactMatchFound) {
                    if (sumWeights === 0) {
                        // This case should ideally not happen if there are data points,
                        // but prevents division by zero if weights are infinitesimally small.
                        newInterpolatedGrid[i][j] = 0; // Fallback or NaN
                    } else {
                        newInterpolatedGrid[i][j] = sumWeightedValues / sumWeights;
                    }
                }
            } // End of j loop
        } // End of i loop
        setInterpolatedGrid({
            grid: newInterpolatedGrid,
            minLat, maxLat, minLon, maxLon,
            gridLats, gridLons,
            minMoisture, maxMoisture
        });
    }, [measuredData, idwPower, gridResolutionDegrees, bufferDegrees]);

    // Effect hook to trigger IDW calculation when measuredData changes
    useEffect(() => {
        calculateIDW();
    }, [calculateIDW]);

    // Effect hook to draw on canvas when interpolatedGrid changes
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !interpolatedGrid) return;

        const ctx = canvas.getContext('2d');
        const { grid, minLat, maxLat, minLon, maxLon, gridLats, gridLons, minMoisture, maxMoisture } = interpolatedGrid;

        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        ctx.clearRect(0, 0, canvasWidth, canvasHeight); // Clear previous drawing

        // Calculate scaling factors to map geo-coords to canvas pixels
        const latRange = maxLat - minLat;
        const lonRange = maxLon - minLon;

        // Iterate through the interpolated grid and draw pixels
        for (let i = 0; i < gridLats.length; i++) {
            for (let j = 0; j < gridLons.length; j++) {
                const moisture = grid[i][j];

                // Calculate the pixel coordinates
                const x = ((gridLons[j] - minLon) / lonRange) * canvasWidth;
                // Latitudes increase upwards in terms of Y-coordinates on a map, but downwards on a canvas.
                // So, invert the Y calculation.
                const y = ((maxLat - gridLats[i]) / latRange) * canvasHeight;

                ctx.fillStyle = getColor(moisture, minMoisture, maxMoisture);
                ctx.fillRect(x, y, canvasWidth / gridLons.length + 1, canvasHeight / gridLats.length + 1); // +1 to ensure coverage
            }
        }

        // Draw measured points on top
        measuredData.forEach(([lat, lon, moisture]) => {
            const x = ((lon - minLon) / lonRange) * canvasWidth;
            const y = ((maxLat - lat) / latRange) * canvasHeight;

            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI); // Draw a circle
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; // White circles with transparency
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Optional: Draw moisture value next to the point
            ctx.fillStyle = 'black';
            ctx.font = '10px Arial';
            ctx.fillText(moisture.toFixed(1), x + 8, y + 4);
        });

    }, [interpolatedGrid, measuredData, getColor]);

    // Function to handle file upload
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                parseDataAndSetState(text);
            };
            reader.readAsText(file);
        }
    };

    // Function to parse the CSV/text data
    const parseDataAndSetState = (text) => {
        const lines = text.split('\n').filter(line => line.trim() !== ''); // Split by line and remove empty lines
        const parsedData = lines.map(line => {
            const parts = line.split(','); // Assuming comma-separated values
            if (parts.length === 3) {
                const lat = parseFloat(parts[0]);
                const lon = parseFloat(parts[1]);
                const moisture = parseFloat(parts[2]);
                if (!isNaN(lat) && !isNaN(lon) && !isNaN(moisture)) {
                    return [lat, lon, moisture];
                }
            }
            return null; // Return null for invalid lines
        }).filter(item => item !== null); // Filter out any null entries from invalid lines

        if (parsedData.length > 0) {
            setMeasuredData(parsedData);
        } else {
            alert("No valid data found in the uploaded file. Please ensure it's a CSV/text file with 'latitude,longitude,moisture' format.");
        }
    };


    return (
        <div className="font-inter text-gray-800 flex flex-col items-center justify-center">
            {/* The script and link tags for Tailwind and Inter font are not needed here
                as they are handled by the environment or build process in a real React app.
                Keeping them directly in JSX like this causes issues. */}

            <style>
                {`
                body {
                    font-family: 'Inter', sans-serif;
                    margin: 0; /* Remove default body margin */
                    display: flex; /* Make body a flex container */
                    justify-content: center; /* Center horizontally */
                    align-items: center; /* Center vertically */
                    min-height: 100vh; /* Ensure body takes full viewport height */
                    background-color: #f3f4f6; /* Match the gray-100 of the app background for continuity */
                }
                #root { /* Assuming your React app mounts to a div with id="root" */
                    width: 100%; /* Allow #root to fill width if needed */
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .canvas-container {
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                }
                canvas {
                    display: block;
                    background-color: #f0f0f0; /* Fallback background */
                }
                `}
            </style>

            <h1 className="text-3xl font-semibold text-blue-700 mb-6 rounded-lg bg-white p-3 shadow-md ">
                Soil Moisture Heatmap (IDW)
            </h1>

            <div className="w-full max-w-4xl bg-white p-6 rounded-lg shadow-xl mb-8">
                <h2 className="text-2xl font-medium text-gray-700 mb-4">Upload Data</h2>
                <input
                    type="file"
                    accept=".csv, .txt"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
                />
                <p className="text-sm text-gray-500 mt-2">
                    Upload a CSV or text file with data in the format: `latitude, longitude, moisture_value` per line. Example: 29.7455, -95.7797, 50.00
                </p>
            </div>

            <div className="w-full max-w-4xl bg-white p-6 rounded-lg shadow-xl canvas-container">
                <h2 className="text-2xl font-medium text-gray-700 mb-4">Interpolated Soil Moisture Heatmap</h2>
                <div className="relative w-full h-96"> {/* Adjust height as needed */}
                    <canvas
                        ref={canvasRef}
                        width={800} // Fixed width for consistent rendering, adjusted by CSS fluid width
                        height={600} // Fixed height
                        className="w-full h-full rounded-md"
                    ></canvas>
                    {interpolatedGrid && (
                        <div className="absolute bottom-2 left-2 bg-white bg-opacity-75 p-2 rounded-md text-xs shadow">
                            <p>Min Moisture: {interpolatedGrid.minMoisture.toFixed(1)}</p>
                            <p>Max Moisture: {interpolatedGrid.maxMoisture.toFixed(1)}</p>
                            <p>IDW Power: {idwPower}</p>
                        </div>
                    )}
                </div>
                <p className="text-sm text-gray-500 mt-4">
                    The heatmap visualizes estimated soil moisture. Lighter areas represent lower moisture, darker areas represent higher moisture.
                
                </p>
            </div>
        </div>
    );
};

export default App;