import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

async function main() {
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("Please set your PRIVATE_KEY in the .env file");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider("https://asga-2752562277992000-1.jsonrpc.sagarpc.io");
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Connected with address: ${wallet.address}`);

  const artifactsPath = path.join(__dirname, "../artifacts/contracts/Contract.sol/CrawlRegistry.json");
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));

  const contract = new ethers.Contract(CONTRACT_ADDRESS, contractArtifact.abi, wallet);

  // Data URLs from latest generation
  const contentLink = "https://gateway.irys.xyz/9X5p1b8J76UeR2jPAEAxyHP8rH23gfPjZ2Yr3KF75Au4";
  const tokenURI = "https://gateway.irys.xyz/8g9jFRRqybUPn4ZrZ725qNJ5sA75CZTLB8MTfP1DudRL";

  console.log("Minting NFT from latest generated data...");
  console.log(`Content Link: ${contentLink}`);
  console.log(`Metadata URI: ${tokenURI}`);

  try {
    const tx = await contract.mintMetadataNFT(
      "SagaSynth Generated Medical Data",
      ethers.keccak256(ethers.toUtf8Bytes("Generated Medical Dataset " + Date.now())),
      contentLink,
      "vector_" + Date.now(),
      Math.floor(Date.now() / 1000),
      ["medical", "synthetic", "ai-generated", "sagasynth"],
      tokenURI
    );

    const receipt = await tx.wait();
    console.log("✅ NFT minted successfully!");
    console.log(`Transaction hash: ${tx.hash}`);

    // Get the token ID from the event
    const event = receipt.logs.find(
      (log: any) => log.fragment && log.fragment.name === "MetadataMinted"
    );

    if (event) {
      const tokenId = event.args[0];
      console.log(`🎉 New Token ID: ${tokenId}`);
      console.log(`📊 You now have ${Number(tokenId)} tokens total!`);
    }
  } catch (error) {
    console.error("❌ Error minting NFT:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 