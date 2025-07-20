import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// Contract address - updated to correct address
const CONTRACT_ADDRESS = "0x6251C36F321aeEf6F06ED0fdFcd597862e784D06";

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

  // Validate amount
  try {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      console.error("❌ Invalid amount. Must be a positive number.");
      process.exit(1);
    }
    if (amountNum > 1) {
      console.log("⚠️  Warning: You're about to donate more than 1 ETH!");
    }
  } catch (error) {
    console.error("❌ Invalid amount format.");
    process.exit(1);
  }

  // Connect to the Saga network
  const provider = new ethers.JsonRpcProvider("https://asga-2752562277992000-1.jsonrpc.sagarpc.io");
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log(`Connected with address: ${wallet.address}`);

  // Get the contract artifacts for ABI
  const artifactsPath = path.join(__dirname, "../artifacts/contracts/Contract.sol/CrawlRegistry.json");
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
  
  // Create contract instance
  const contract = new ethers.Contract(CONTRACT_ADDRESS, contractArtifact.abi, wallet);
  
  try {
    // First, verify token exists
    console.log(`🔍 Checking token ${tokenId}...`);
    
    let owner;
    try {
      owner = await contract.ownerOf(tokenId);
    } catch (error) {
      console.error(`❌ Token ${tokenId} does not exist!`);
      process.exit(1);
    }

    // Get on-chain metadata
    const metadata = await contract.getMetadata(tokenId);
    const tokenURI = await contract.tokenURI(tokenId);
    
    // Fetch additional metadata from tokenURI
    let additionalMetadata = null;
    try {
      const response = await axios.get(tokenURI, { timeout: 5000 });
      additionalMetadata = response.data;
    } catch (error) {
      console.log(`⚠️  Could not fetch additional metadata: ${(error as Error).message}`);
    }

    // Display token information
    console.log("\n📊 === TOKEN INFORMATION ===");
    console.log(`Token ID: ${tokenId}`);
    console.log(`Creator: ${metadata.owner}`);
    console.log(`Source URL: ${metadata.source_url}`);
    console.log(`Tags: ${metadata.tags.join(", ")}`);
    
    if (additionalMetadata) {
      console.log(`📝 Name: ${additionalMetadata.name || "N/A"}`);
      console.log(`📋 Description: ${additionalMetadata.description || "N/A"}`);
      console.log(`🏷️  Domain: ${additionalMetadata.domain || "N/A"}`);
      console.log(`📊 Sample Size: ${additionalMetadata.sample_size || "N/A"}`);
      console.log(`💰 Price: ${additionalMetadata.price_usdc ? `$${additionalMetadata.price_usdc}` : "Free"}`);
    }

    // Get current creator balance
    const creatorBalanceBefore = await provider.getBalance(metadata.owner);
    console.log(`\n💳 Creator's current balance: ${ethers.formatEther(creatorBalanceBefore)} ETH`);

    // Show donation details
    console.log("\n💝 === DONATION DETAILS ===");
    console.log(`Amount: ${amount} ETH`);
    console.log(`To: ${metadata.owner}`);
    console.log(`Gas cost: ~0.001 ETH (estimated)`);

    // Proceed with donation
    console.log(`\n🚀 Donating ${amount} ETH to the creator...`);
    const tx = await contract.donateToCreator(tokenId, {
      value: ethers.parseEther(amount)
    });
    
    console.log(`📋 Transaction hash: ${tx.hash}`);
    console.log("⏳ Waiting for transaction confirmation...");
    
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
    
    // Check creator's balance after donation
    const creatorBalanceAfter = await provider.getBalance(metadata.owner);
    const difference = creatorBalanceAfter - creatorBalanceBefore;
    
    console.log("\n🎉 === DONATION SUCCESSFUL ===");
    console.log(`💰 Creator received: ${ethers.formatEther(difference)} ETH`);
    console.log(`💳 Creator's new balance: ${ethers.formatEther(creatorBalanceAfter)} ETH`);
    console.log(`🔗 Explorer: https://sagascan.io/tx/${tx.hash}`);
    
    if (additionalMetadata?.name) {
      console.log(`\n📝 Thank you for supporting "${additionalMetadata.name}"!`);
    }
    
  } catch (error) {
    console.error("❌ Donation failed:", error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 