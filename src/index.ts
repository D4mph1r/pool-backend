//@ts-nocheck
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AptosClient } from "aptos";
import { TPoolObject, TPools, TSenderEntries } from "./types";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());


const NODE_URL = "https://mainnet.movementnetwork.xyz/v1";
const client = new AptosClient(NODE_URL);


const coinsMapping = {
    "wbtce": "wrapped-bitcoin",
    "rseth": "kelp-dao-restaked-eth",
    "wethe": "weth",
    "usdte": "tether",
    "usdce": "usd-coin",
    "stbtc": "lorenzo-stbtc",
    "sbtc": "lorenzo-stbtc",
    "weeth": "wrapped-eeth",
    "solvbtc": "solv-btc",
    "move": "movement",
    "aptoscoin": "movement"
},

const startServer = async () => {
    try {
        // @ts-ignore
        app.post('/', async (req, res) => {
            try {
                const { pairs, from, to, min, max } = req.body;
                const data: any[] = [];

                const coins = (await axios.get("https://api.liquidswap.com/coins/registered?networkId=126")).data;
                const prices = (await axios.get("https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=movement,movement,tether,usd-coin,weth,wrapped-bitcoin,solv-btc,lombard-staked-btc,lorenzo-stbtc,lorenzo-wrapped-bitcoin,renzo-restaked-eth,kelp-dao-restaked-eth,wrapped-eeth,frax-usd,staked-frax-usd,ethena-usde,ethena-staked-usde")).data;

                // console.log("prices", prices);

                const fromDate = BigInt(from);
                const toDate = BigInt(to);
                const resources = await client.getAccountResources(process.env.POOL_RESERVE_ADDRESS);

                let filteredResources = [];
                if (pairs) {

                    const allPairs = pairs.split(",");

                    for (const p of allPairs) {
                        const tokenX = p.split("-")[0] === "Move" ? "AptosCoin" : p.split("-")[0];
                        const tokenY = p.split("-")[1] === "Move" ? "AptosCoin" : p.split("-")[1];

                        resources.filter((t) => {
                            if (t.type.includes("liquidity_pool::EventsStore") && t.type.toLowerCase().includes(`::${tokenX.toLowerCase()}`) && t.type.toLowerCase().includes(`::${tokenY.toLowerCase()}`)) {
                                filteredResources.push({ pool: p, ...t });
                            }
                        });
                    }

                    if (filteredResources) {
                        for (const resource of filteredResources) {

                            const poolObj: TPoolObject = {
                                [resource.pool]: []
                            };
                            const tokenX = resource.pool.split('-')[0].toLowerCase();
                            const tokenY = resource.pool.split('-')[1].toLowerCase();

                            const tokenXDecimals = coins.find(coin => coin.symbol.toLowerCase().replace(".", "") === tokenX)?.decimals || 6;
                            const tokenYDecimals = coins.find(coin => coin.symbol.toLowerCase().replace(".", "") === tokenY)?.decimals || 6;

                            console.log({ tokenXDecimals, tokenYDecimals });

                            const xDenominator = 10 ** tokenXDecimals;
                            const yDenominator = 10 ** tokenYDecimals;

                            const priceX = prices[coinsMapping[tokenX]]?.usd || 0;
                            const priceY = prices[coinsMapping[tokenY]]?.usd || 0;

                            // console.log({ tokenX, tokenXDecimals, tokenY, tokenYDecimals, xDenominator, yDenominator });

                            const liquidityAddedEvents = await client.getEventsByCreationNumber(
                                resource.data.liquidity_added_handle.guid.id.addr,
                                resource.data.liquidity_added_handle.guid.id.creation_num
                            )
                            const liquidityRemovedEvents = await client.getEventsByCreationNumber(
                                resource.data.liquidity_removed_handle.guid.id.addr,
                                resource.data.liquidity_removed_handle.guid.id.creation_num
                            )

                            for (const add of liquidityAddedEvents) {
                                const tx = await client.getTransactionByVersion(add.version);
                                const txTimestamp = BigInt(tx.timestamp);
                                if (tx.vm_status === "Executed successfully") {
                                    if (txTimestamp >= fromDate && txTimestamp <= toDate) {

                                        console.log(prices[coinsMapping[tokenX]], tokenX)
                                        console.log(prices[coinsMapping[tokenY]], tokenY)

                                        add.data.added_x_val = (Number(BigInt(add.data.added_x_val)) / Number(xDenominator)).toFixed(8);
                                        add.data.added_y_val = (Number(BigInt(add.data.added_y_val)) / Number(yDenominator)).toFixed(8);

                                        add.data.usd_x = add.data.added_x_val * priceX;
                                        add.data.usd_y = add.data.added_y_val * priceY;

                                        add.data.usd = (add.data.usd_x + add.data.usd_y).toFixed(8);

                                        const exists = poolObj[resource.pool].some(obj => tx.sender in obj);

                                        let senderObj: TSenderEntries;
                                        if (!exists) {
                                            senderObj = {
                                                [tx.sender]: []
                                            };
                                            senderObj[tx.sender].push({
                                                sender: tx.sender,
                                                data: add.data,
                                                timestamp: tx.timestamp
                                            });
                                            poolObj[resource.pool].push(senderObj)
                                        }
                                        else {
                                            const index = poolObj[resource.pool].findIndex(obj => tx.sender in obj);
                                            poolObj[resource.pool][index][tx.sender].push({
                                                sender: tx.sender,
                                                data: add.data,
                                                timestamp: tx.timestamp
                                            })
                                        }
                                    }
                                }
                            }

                            for (const remove of liquidityRemovedEvents) {
                                const tx = await client.getTransactionByVersion(remove.version);
                                const txTimestamp = BigInt(tx.timestamp);
                                if (tx.vm_status === "Executed successfully") {
                                    if (txTimestamp >= fromDate && txTimestamp <= toDate) {

                                        console.log(prices[coinsMapping[tokenX]], tokenX)
                                        console.log(prices[coinsMapping[tokenY]], tokenY)

                                        remove.data.returned_x_val = (Number(BigInt(remove.data.returned_x_val)) / Number(xDenominator)).toFixed(8);
                                        remove.data.returned_y_val = (Number(BigInt(remove.data.returned_y_val)) / Number(yDenominator)).toFixed(8);

                                        remove.data.usd_x = remove.data.returned_x_val * priceX;
                                        remove.data.usd_y = remove.data.returned_y_val * priceY;

                                        remove.data.usd = (remove.data.usd_x + remove.data.usd_y).toFixed(8);

                                        const exists = poolObj[resource.pool].some(obj => tx.sender in obj);

                                        let senderObj: TSenderEntries;
                                        if (!exists) {
                                            senderObj = {
                                                [tx.sender]: []
                                            };

                                            senderObj[tx.sender].push({
                                                sender: tx.sender,
                                                data: remove.data,
                                                timestamp: tx.timestamp
                                            });
                                            poolObj[resource.pool].push(senderObj)
                                        }

                                        else {
                                            const index = poolObj[resource.pool].findIndex(obj => tx.sender in obj);
                                            poolObj[resource.pool][index][tx.sender].push({
                                                sender: tx.sender,
                                                data: remove.data,
                                                timestamp: tx.timestamp
                                            })
                                        }
                                    }
                                }
                            }
                            data.push(poolObj);
                        }
                    }
                }

                console.dir(data, { depth: null })


                // console.log("GASDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDd");
                
                // const sorted = data.map(pool => {
                //     const [poolName, users] = Object.entries(pool)[0];
                //     const sortedUsers = users.map(user => {
                //         const [address, transactions] = Object.entries(user)[0];
                //         const sortedTransactions = transactions.sort((a, b) => BigInt(a.timestamp) > BigInt(b.timestamp) ? 1 : -1);
                //         return { [address]: sortedTransactions };
                //     });
                //     return { [poolName]: sortedUsers };
                // });

                // console.dir(sorted, { depth: null })


                res.status(200).json({
                    data: data
                });
            } catch (error) {
                console.log(error);
                res.status(500).json({ error: 'failed to get user data' });
            }
        });


        // @ts-ignore
        app.get('/pools', async (req, res) => {

            let pools: TPools[] = [];
            const resources = await client.getAccountResources(process.env.POOL_RESERVE_ADDRESS);
            const filteredResources = resources.filter((r) => {
                return r.type.includes("0xd5367fdfa219cb0a108c7751cdbfbb02bfcb71ea932c33007b10a05ae5502500::liquidity_pool::LiquidityPool")
            });
            console.log(filteredResources.length);

            filteredResources.forEach((r) => {
                const type = r.type.replace(/[<> ]/g, '');
                const xyz = type.split("LiquidityPool")[1].split(',');

                if (xyz.length === 3) {
                    const tokenX = xyz[0].split('::')[2];
                    const tokenY = xyz[1].split('::')[2];
                    const curve = xyz[2].split('::')[2];

                    pools.push({
                        tokenX: tokenX === "AptosCoin" ? "Move" : tokenX,
                        tokenY: tokenY === "AptosCoin" ? "Move" : tokenY,
                        curve
                    })
                }
            });

            res.status(200).json({
                pools
            });

        });

        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Failed to connect", error);
        process.exit(1);
    }
};

startServer();