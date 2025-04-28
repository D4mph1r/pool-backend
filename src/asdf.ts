//@ts-nocheck
import { AptosClient } from "aptos";
import dotenv from "dotenv";

const NODE_URL = "https://mainnet.movementnetwork.xyz/v1";
const client = new AptosClient(NODE_URL);
dotenv.config();

(async () => {

    const pairs = "WBTCe-WETHe,SBTC-WBTCe";
    const data: any[] = [];

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

                const poolObj = {
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
                    console.log(tx.vm_status);

                    if (tx.vm_status === "Executed successfully") {
                        const exists = poolObj[resource.pool].some(obj => tx.sender in obj);

                        let senderObj;
                        if (!exists) {
                            senderObj = {
                                [tx.sender]: []
                            };

                            senderObj[tx.sender].push({
                                data: add.data,
                                timestamp: tx.timestamp
                            });
                            poolObj[resource.pool].push(senderObj)
                        }

                        else {
                            const index = poolObj[resource.pool].findIndex(obj => tx.sender in obj);
                            poolObj[resource.pool][index][tx.sender].push({
                                data: add.data,
                                timestamp: tx.timestamp
                            })
                        }
                    }

                }


                data.push(poolObj);
            }
        }
        console.dir(data, { depth: null })
    }

})()