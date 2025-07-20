import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const CONTRACT_ADDRESS = "0xf28968c7a66991C5006a52000D38ED7863f5255EC"; // Replace with your deployed contract address

async function main() {
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("Please set your PRIVATE_KEY in the .env file");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider("https://asga-2752562277992000-1.jsonrpc.sagarpc.io");
  const wallet = new ethers.Wallet(privateKey, provider);

  const artifactsPath = path.join(__dirname, "../artifacts/contracts/Contract.sol/CrawlRegistry.json");
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));

  const contract = new ethers.Contract(CONTRACT_ADDRESS, contractArtifact.abi, wallet);

  const allMetadata = [];
  const totalSupply = await contract.totalSupply();

  for (let i = 1; i <= totalSupply; i++) {
    try {
      const metadata = await contract.getMetadata(i);
      const tokenURI = await contract.tokenURI(i);
      allMetadata.push({
        tokenId: i,
        source_url: metadata.source_url,
        content_hash: metadata.content_hash,
        content_link: metadata.content_link,
        embed_vector_id: metadata.embed_vector_id,
        created_at: Number(metadata.created_at),
        tags: metadata.tags,
        owner: metadata.owner,
        tokenURI: tokenURI
      });
    } catch (error) {
      console.error(`Could not fetch metadata for token ${i}:`, error);
    }
  }

  console.log(JSON.stringify(allMetadata, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });