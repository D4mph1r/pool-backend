// @ts-nocheck
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AptosClient } from "aptos";
import { TPoolObject, TPools, TSenderEntries } from "./types";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());


const NODE_URL = "https://mainnet.movementnetwork.xyz/v1";
const client = new AptosClient(NODE_URL);


const startServer = async () => {
    try {
        // @ts-ignore
        app.post('/', async (req, res) => {
            try {
                const { pairs, from, to } = req.body;
                const data: any[] = [];

                // const pairs = "WBTCe-WETHe,SBTC-WBTCe";
                // const data: any[] = [];

                const fromDate = BigInt(from);
                const toDate = BigInt(to);

                console.log(process.env.POOL_RESERVE_ADDRESS);

                const resources = await client.getAccountResources(process.env.POOL_RESERVE_ADDRESS);

                console.log(resources.length);


                let filteredResources = [];
                if (pairs) {

                    const allPairs = pairs.split(",");

                    for (const p of allPairs) {
                        const tokenX = p.split("-")[0];
                        const tokenY = p.split("-")[1];

                        resources.filter((t) => {
                            if (t.type.includes("liquidity_pool::EventsStore") && t.type.toLowerCase().includes(`::${tokenX.toLowerCase()}`) && t.type.toLowerCase().includes(`::${tokenY.toLowerCase()}`)) {
                                filteredResources.push({ pool: p, ...t });
                            }
                        });
                    }

                    console.log(filteredResources);


                    if (filteredResources) {
                        for await (const resource of filteredResources) {

                            const poolObj: TPoolObject = {
                                [resource.pool]: []
                            };

                            const liquidityAddedEvents = await client.getEventsByCreationNumber(
                                resource.data.liquidity_added_handle.guid.id.addr,
                                resource.data.liquidity_added_handle.guid.id.creation_num
                            )
                            const liquidityRemovedEvents = await client.getEventsByCreationNumber(
                                resource.data.liquidity_removed_handle.guid.id.addr,
                                resource.data.liquidity_removed_handle.guid.id.creation_num
                            )

                            for await (const add of liquidityAddedEvents) {
                                const tx = await client.getTransactionByVersion(add.version);
                                const txTimestamp = BigInt(tx.timestamp);
                                console.log(tx.vm_status);

                                if (tx.vm_status === "Executed successfully") {

                                    if (txTimestamp >= fromDate && txTimestamp <= toDate) {

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



                            for await (const remove of liquidityRemovedEvents) {
                                const tx = await client.getTransactionByVersion(remove.version);
                                const txTimestamp = BigInt(tx.timestamp);
                                console.log(tx.vm_status);

                                if (tx.vm_status === "Executed successfully") {
                                    if (txTimestamp >= fromDate && txTimestamp <= toDate) {
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
                    console.dir(data, { depth: null })
                }

                const sorted = data.map(pool => {
                    const [poolName, users] = Object.entries(pool)[0];
                    const sortedUsers = users.map(user => {
                        const [address, transactions] = Object.entries(user)[0];
                        const sortedTransactions = transactions.sort((a, b) => BigInt(a.timestamp) > BigInt(b.timestamp) ? 1 : -1);
                        return { [address]: sortedTransactions };
                    });
                    return { [poolName]: sortedUsers };
                });

                res.status(200).json({
                    data: sorted
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

                console.log(xyz);

                if (xyz.length === 3) {
                    const tokenX = xyz[0].split('::')[2];
                    const tokenY = xyz[1].split('::')[2];
                    const curve = xyz[2].split('::')[2];

                    pools.push({
                        tokenX,
                        tokenY,
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