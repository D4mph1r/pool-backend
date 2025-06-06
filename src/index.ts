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
app.use(cors("*"));


const NODE_URL = process.env.MOVEMENT_RPC;
const liquidSwapApi = process.env.LIQUIDSWAP_API;
const pricesApi = process.env.PRICES_API;

const client = new AptosClient(NODE_URL);
const MICRO_SECONDS_PER_DAY = 1_000_000 * 60 * 60 * 24;

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

                const coins = (await axios.get(liquidSwapApi)).data;
                const prices = (await axios.get(pricesApi)).data;

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

                let rows = [];
                let count = 0;
                let totalRewards = 0;
                data.forEach((e) => {
                    const pool = Object.keys(e)[0];
                    console.log('pool', pool);

                    Object.values(e)[0].forEach((x) => {
                        let lastRowWhat = '';
                        let lastRowTokenX = 0;
                        let lastRowTokenY = 0;
                        let lastRowUsd = 0;
                        let lastRowTimestamp = 0;
                        let nextRowTimestamp = 0;
                        let reward = 0;
                        let totalRewardPerAddress = 0;
                        let sender = '';

                        Object.values(x).map((y) => {
                            let c = 0;
                            totalRewardPerAddress = 0;
                            //@ts-ignore
                            let allRecords = [...y];
                            //@ts-ignore
                            y.map((z) => {
                                // console.log(allRecords);
                                lastRowTimestamp = Number(z.timestamp);
                                nextRowTimestamp = allRecords[c + 1]?.timestamp ? Number(allRecords[c + 1].timestamp) : to;
                                lastRowWhat = z.data.lp_tokens_received ? 'add' : 'remove';

                                lastRowTokenX = z.data.lp_tokens_received
                                    ? lastRowWhat == 'add'
                                        ? Number(z.data.added_x_val) + lastRowTokenX
                                        : Number(z.data.added_x_val)
                                    : lastRowWhat == 'remove'
                                        ? Math.abs(Number(z.data.returned_x_val) - lastRowTokenX)
                                        : Number(z.data.returned_x_val);

                                lastRowTokenY = z.data.lp_tokens_received
                                    ? lastRowWhat == 'add'
                                        ? Number(z.data.added_y_val) + lastRowTokenY
                                        : Number(z.data.added_y_val)
                                    : lastRowWhat == 'remove'
                                        ? Math.abs(Number(z.data.returned_y_val) - lastRowTokenY)
                                        : Number(z.data.returned_y_val);

                                lastRowUsd = z.data.lp_tokens_received
                                    ? lastRowWhat == 'add'
                                        ? Number(z.data.usd) + lastRowUsd
                                        : Number(z.data.usd)
                                    : lastRowWhat == 'remove'
                                        ? Math.abs(Number(z.data.usd) - lastRowUsd)
                                        : Number(z.data.usd);

                                reward = 0;
                                sender = '';

                                const diffMicroseconds = Math.abs(lastRowTimestamp - nextRowTimestamp);

                                const diffDays = diffMicroseconds / MICRO_SECONDS_PER_DAY;

                                console.log(`Difference in days: ${diffDays}`);

                                if (lastRowUsd >= min && lastRowUsd <= max) {
                                    reward = diffDays * lastRowUsd;
                                } else if (lastRowUsd >= max) {
                                    reward = diffDays * max;
                                }
                                sender = z.sender;
                                rows.push({
                                    id: count,
                                    sender: sender,
                                    pool: pool,
                                    tokenX: lastRowTokenX,
                                    tokenY: lastRowTokenY,
                                    usd: lastRowUsd,
                                    reward: reward,
                                    timestamp: new Date(Number(z.timestamp) / 1000).toLocaleString(),
                                });
                                totalRewardPerAddress = totalRewardPerAddress + reward;
                                count++;
                                c++;
                            });
                            rows.push({
                                id: count,
                                sender: sender,
                                pool: '',
                                tokenX: '',
                                tokenY: '',
                                usd: '',
                                reward: totalRewardPerAddress,
                                timestamp: '',
                            });
                            totalRewards = totalRewards + totalRewardPerAddress;
                            count++;
                        });
                    });
                });

                console.log({ rows });



                res.status(200).json({
                    totalRewards,
                    data:rows
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
                return r.type.includes(`${process.env.MAIN_POOL_ADDRESS}::liquidity_pool::LiquidityPool`)
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

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Failed to connect", error);
        process.exit(1);
    }
};

startServer();