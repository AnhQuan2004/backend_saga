import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// Contract address - replace with your deployed contract address
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

// Function to get bounty details
async function getBountyDetails(contract: ethers.Contract, bountyId: bigint) {
  try {
    // Get bounty details
    const bounty = await contract.bounties(bountyId);
    
    // Get bounty contributors
    const contributors = [];
    let i = 0;
    let hasMore = true;
    
    // Since we can't directly get the array of contributors from the mapping,
    // we'll try to access contributors until we get an error
    while (hasMore) {
      try {
        const contributor = await contract.bounties(bountyId, "contributors", i);
        contributors.push(contributor);
        i++;
      } catch (error) {
        hasMore = false;
      }
    }
    
    return {
      id: Number(bountyId),
      amount: ethers.formatEther(bounty.amount),
      creator: bounty.creator,
      contributors: contributors,
      distributed: bounty.distributed
    };
  } catch (error) {
    console.error(`Error getting details for bounty ${bountyId}:`, error);
    return null;
  }
}

// Function to get all bounties
async function getAllBounties() {
  try {
    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY || "";
    if (!privateKey) {
      console.error("Please set your PRIVATE_KEY in the .env file");
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
    
    // Get the next bounty ID to determine how many bounties exist
    const nextBountyId = await contract.nextBountyId();
    console.log(`Total bounties: ${nextBountyId}`);
    
    if (Number(nextBountyId) === 0) {
      console.log("No bounties found.");
      return [];
    }
    
    // Get details for each bounty
    const allBounties = [];
    for (let i = 0; i < Number(nextBountyId); i++) {
      console.log(`Getting details for bounty ${i}...`);
      const bountyDetails = await getBountyDetails(contract, BigInt(i));
      
      if (bountyDetails) {
        allBounties.push(bountyDetails);
        console.log(`Bounty ${i}: ${bountyDetails.amount} ETH, Creator: ${bountyDetails.creator}`);
      }
    }
    
    return allBounties;
  } catch (error) {
    console.error("Error getting all bounties:", error);
    throw error;
  }
}

// Function to get bounties created by a specific address
async function getBountiesByCreator(creatorAddress: string) {
  try {
    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY || "";
    if (!privateKey) {
      console.error("Please set your PRIVATE_KEY in the .env file");
      process.exit(1);
    }
  
    // Connect to the Saga network
    const provider = new ethers.JsonRpcProvider("https://asga-2752562277992000-1.jsonrpc.sagarpc.io");
    const wallet = new ethers.Wallet(privateKey, provider);
  
    // Get the contract artifacts for ABI
    const artifactsPath = path.join(__dirname, "../artifacts/contracts/Contract.sol/CrawlRegistry.json");
    const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
    
    // Create contract instance
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractArtifact.abi, wallet);
    
    // Get the next bounty ID to determine how many bounties exist
    const nextBountyId = await contract.nextBountyId();
    console.log(`Total bounties: ${nextBountyId}`);
    
    if (Number(nextBountyId) === 0) {
      console.log("No bounties found.");
      return [];
    }
    
    // Get details for each bounty and filter by creator
    const creatorBounties = [];
    for (let i = 0; i < Number(nextBountyId); i++) {
      const bounty = await contract.bounties(i);
      
      if (bounty.creator.toLowerCase() === creatorAddress.toLowerCase()) {
        console.log(`Getting details for bounty ${i}...`);
        const bountyDetails = await getBountyDetails(contract, BigInt(i));
        
        if (bountyDetails) {
          creatorBounties.push(bountyDetails);
          console.log(`Bounty ${i}: ${bountyDetails.amount} ETH, Creator: ${bountyDetails.creator}`);
        }
      }
    }
    
    return creatorBounties;
  } catch (error) {
    console.error(`Error getting bounties for creator ${creatorAddress}:`, error);
    throw error;
  }
}

// Function to get bounties where a specific address is a contributor
async function getBountiesForContributor(contributorAddress: string) {
  try {
    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY || "";
    if (!privateKey) {
      console.error("Please set your PRIVATE_KEY in the .env file");
      process.exit(1);
    }
  
    // Connect to the Saga network
    const provider = new ethers.JsonRpcProvider("https://asga-2752562277992000-1.jsonrpc.sagarpc.io");
    const wallet = new ethers.Wallet(privateKey, provider);
  
    // Get the contract artifacts for ABI
    const artifactsPath = path.join(__dirname, "../artifacts/contracts/Contract.sol/CrawlRegistry.json");
    const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
    
    // Create contract instance
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractArtifact.abi, wallet);
    
    // Get the next bounty ID to determine how many bounties exist
    const nextBountyId = await contract.nextBountyId();
    console.log(`Total bounties: ${nextBountyId}`);
    
    if (Number(nextBountyId) === 0) {
      console.log("No bounties found.");
      return [];
    }
    
    // Get details for each bounty and check if the address is a contributor
    const contributorBounties = [];
    for (let i = 0; i < Number(nextBountyId); i++) {
      console.log(`Checking bounty ${i} for contributor ${contributorAddress}...`);
      const bountyDetails = await getBountyDetails(contract, BigInt(i));
      
      if (bountyDetails && bountyDetails.contributors.some(
        (contributor: string) => contributor.toLowerCase() === contributorAddress.toLowerCase()
      )) {
        contributorBounties.push(bountyDetails);
        console.log(`Bounty ${i}: ${bountyDetails.amount} ETH, Creator: ${bountyDetails.creator}`);
      }
    }
    
    return contributorBounties;
  } catch (error) {
    console.error(`Error getting bounties for contributor ${contributorAddress}:`, error);
    throw error;
  }
}

// Main function to handle command line arguments
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const address = args[1];
  
  let bounties;
  
  if (command === "creator" && address) {
    console.log(`Getting bounties created by: ${address}`);
    bounties = await getBountiesByCreator(address);
  } else if (command === "contributor" && address) {
    console.log(`Getting bounties where ${address} is a contributor`);
    bounties = await getBountiesForContributor(address);
  } else {
    console.log("Getting all bounties");
    bounties = await getAllBounties();
  }
  
  // Output the results
  if (bounties.length > 0) {
    console.log("\n=== Bounties Summary ===");
    bounties.forEach((bounty) => {
      console.log(`\n--- Bounty ${bounty.id} ---`);
      console.log(`Amount: ${bounty.amount} ETH`);
      console.log(`Creator: ${bounty.creator}`);
      console.log(`Contributors: ${bounty.contributors.length}`);
      console.log(`Distributed: ${bounty.distributed ? "Yes" : "No"}`);
    });
    
    // Save to file
    const outputPath = path.join(__dirname, "../bounties-output.json");
    fs.writeFileSync(outputPath, JSON.stringify(bounties, null, 2));
    console.log(`\nBounties saved to ${outputPath}`);
  } else {
    console.log("\nNo bounties found.");
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 