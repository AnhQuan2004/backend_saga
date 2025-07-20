import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// Contract address - replace with your deployed contract address
const CONTRACT_ADDRESS = "0xEb2959E7089e56AB4d4d15335bc98430dE25A6cE";

async function main() {
  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("Please set your PRIVATE_KEY in the .env file");
    process.exit(1);
  }

  // Get command line arguments
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: npm run donate <tokenId> <amount>");
    console.error("Example: npm run donate 1 0.01");
    process.exit(1);
  }

  const tokenId = BigInt(args[0]);
  const amount = args[1];

  // Connect to the Saga network
  const provider = new ethers.JsonRpcProvider("https://asga-2752562277992000-1.jsonrpc.sagarpc.io");
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log(`Connected with address: ${wallet.address}`);

  // Get the contract artifacts for ABI
  const artifactsPath = path.join(__dirname, "../artifacts/contracts/Contract.sol/CrawlRegistry.json");
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
  
  // Create contract instance
  const contract = new ethers.Contract(CONTRACT_ADDRESS, contractArtifact.abi, wallet);
  
  // First, get the metadata to check the creator
  try {
    const metadata = await contract.getMetadata(tokenId);
    console.log(`Token ${tokenId} creator: ${metadata.owner}`);
    console.log(`Source URL: ${metadata.source_url}`);
    
    // Donate to the creator
    console.log(`Donating ${amount} ETH to the creator...`);
    const tx = await contract.donateToCreator(tokenId, {
      value: ethers.parseEther(amount)
    });
    
    console.log(`Transaction hash: ${tx.hash}`);
    console.log("Waiting for transaction confirmation...");
    
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    console.log("Donation sent successfully!");
    
    // Check the creator's balance
    const creatorBalance = await provider.getBalance(metadata.owner);
    console.log(`Creator's balance: ${ethers.formatEther(creatorBalance)} ETH`);
    
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 