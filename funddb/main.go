// HTTP API
// POST v1/campaigns/create
// POST v1/campaigns/{pda}/contributors/create
// DELETE v1/campaigns/{pda}/contributors/{pk}/delete
// GET v1/campaigns/{pda}/contributors
// GET v1/campaigns/{pda}/is_refundable
package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

var dbName = "test_fund.db"
var db *sql.DB

type Campaign struct {
	ID  int    `json:"id"`
	PDA string `json:"pda"`
}

type Contributor struct {
	ID         int    `json:"id"`
	PDA        string `json:"pda"`
	PK         string `json:"pk"`
	CampaignID int    `json:"campaign_id"`
}

func init() {
	// init the dv
	file, err := os.Create(dbName)
	if err != nil {
		log.Fatalf("Failed to create database file: %v", err)
	}
	file.Close()

	db, err = sql.Open("sqlite3", dbName)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
                CREATE TABLE IF NOT EXISTS campaigns (
                        id INTEGER PRIMARY KEY,
                        pda TEXT NOT NULL
                )
        `)
	if err != nil {
		log.Fatalf("Failed to create 'campaigns' table: %v", err)
	}

	_, err = db.Exec(`
                CREATE TABLE IF NOT EXISTS contributors (
                        id INTEGER PRIMARY KEY,
                        pda TEXT NOT NULL,
                        pk TEXT NOT NULL,
                        campaign_id INTEGER NOT NULL,

                        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
                )
        `)
	if err != nil {
		log.Fatalf("Failed to create 'contributors' table: %v", err)
	}

	log.Println("Database initialized successfully!")
}

func main() {
	r := gin.Default()
	r.POST("/v1/campaigns/create", createCampaign)
	r.POST("/v1/campaigns/:pda/contributors/create", createContributor)
	r.DELETE("/v1/campaigns/:pda/contributors/:pk/delete", deleteContributor)
	r.GET("/v1/campaigns/:pda/contributors", getContributors)
	r.GET("/v1/campaigns/:pda/is_refundable", isRefundable)
	r.Run()
}

func createCampaign(c *gin.Context) {
	var campaign Campaign
	if err := c.ShouldBindJSON(&campaign); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := db.Exec("INSERT INTO campaigns (pda) VALUES (?)", campaign.PDA)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, campaign)
}

func createContributor(c *gin.Context) {
	var contributor Contributor
	if err := c.ShouldBindJSON(&contributor); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	pda := c.Param("pda")
	var campaignID int
	err := db.QueryRow("SELECT id FROM campaigns WHERE pda = ?", pda).Scan(&campaignID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, err = db.Exec("INSERT INTO contributors (pda, pk, campaign_id) VALUES (?, ?, ?)", contributor.PDA, contributor.PK, campaignID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	contributor.CampaignID = campaignID
	c.JSON(http.StatusOK, contributor)
}

func deleteContributor(c *gin.Context) {
	pda := c.Param("pda")
	pk := c.Param("pk")

	var campaignID int
	err := db.QueryRow("SELECT id FROM campaigns WHERE pda = ?", pda).Scan(&campaignID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, err = db.Exec("DELETE FROM contributors WHERE pk = ? AND campaign_id = ?", pk, campaignID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Contributor deleted"})
}

func getContributors(c *gin.Context) {
	pda := c.Param("pda")
	var campaignID int
	err := db.QueryRow("SELECT id FROM campaigns WHERE pda = ?", pda).Scan(&campaignID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rows, err := db.Query("SELECT id, pda, pk, campaign_id FROM contributors WHERE campaign_id = ?", campaignID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var contributors []Contributor
	for rows.Next() {
		var contributor Contributor
		if err := rows.Scan(&contributor.ID, &contributor.PDA, &contributor.PK, &contributor.CampaignID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		contributors = append(contributors, contributor)
	}

	c.JSON(http.StatusOK, contributors)
}

func isRefundable(c *gin.Context) {
	pda := c.Param("pda")
	var campaignID int
	err := db.QueryRow("SELECT id FROM campaigns WHERE pda = ?", pda).Scan(&campaignID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM contributors WHERE campaign_id = ?", campaignID).Scan(&count)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"is_refundable": count > 0})
}
