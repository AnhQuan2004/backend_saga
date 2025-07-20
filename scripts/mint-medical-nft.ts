import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// Contract address
const CONTRACT_ADDRESS = "0x6251C36F321aeEf6F06ED0fdFcd597862e784D06";

async function main() {
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("Please set your PRIVATE_KEY in the .env file");
    process.exit(1);
  }

  // Connect to Saga network
  const provider = new ethers.JsonRpcProvider(
    "https://asga-2752562277992000-1.jsonrpc.sagarpc.io"
  );
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Connected with address: ${wallet.address}`);

  // Get contract artifacts
  const artifactsPath = path.join(
    __dirname,
    "../artifacts/contracts/Contract.sol/CrawlRegistry.json"
  );
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));

  // Create contract instance
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    contractArtifact.abi,
    wallet
  );

  // Mint NFT with uploaded medical data
  async function mintMedicalDataNFT() {
    console.log("Minting Medical Data NFT...");

    // URLs from your upload
    const contentLink =
      "https://gateway.irys.xyz/79BNspugvS1UxPtYW5tyYk3FHcLwzPWsdzyMZgK3QmRY";
    const tokenURI =
      "https://gateway.irys.xyz/32e3FmKguGwpJLoad4bF2nRvxVND9HFDx91a2ZFFz472";

    const sourceUrl = "Medical Data Synthesis";
    const contentHash = ethers.keccak256(
      ethers.toUtf8Bytes("Synthetic Medical Data")
    );
    const embedVectorId = "medical_vector_" + Date.now();
    const createdAt = Math.floor(Date.now() / 1000);
    const tags = ["medical", "synthetic", "dataset", "ai"];

    try {
      const tx = await contract.mintMetadataNFT(
        sourceUrl,
        contentHash,
        contentLink,
        embedVectorId,
        createdAt,
        tags,
        tokenURI
      );

      const receipt = await tx.wait();
      console.log("Medical Data NFT minted successfully!");
      console.log(`Transaction hash: ${tx.hash}`);

      // Get the token ID from the event
      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "MetadataMinted"
      );

      if (event) {
        const tokenId = event.args[0];
        console.log(`Token ID: ${tokenId}`);
        console.log(`Content Link: ${contentLink}`);
        console.log(`Metadata URI: ${tokenURI}`);
        return tokenId;
      }
    } catch (error) {
      console.error("Error minting medical NFT:", error);
    }
  }

  // Execute the minting
  try {
    console.log("=== Minting Medical Data NFT ===");
    const tokenId = await mintMedicalDataNFT();

    if (tokenId) {
      console.log("NFT minted successfully! You can now:");
      console.log("1. View your NFT metadata on-chain");
      console.log("2. Share the content link with others");
      console.log("3. Create bounties for this dataset");
      console.log("4. Receive donations from data users");
    }
  } catch (error) {
    console.error("Error in execution:", error);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
