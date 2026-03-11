package main

import (
	"log"
	"net/http"

	"github.com/purai/handlers"
)

func main() {
	mux := http.NewServeMux()

	// Static files
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Pages
	mux.HandleFunc("/", handlers.IndexHandler)

	// HTMX partials
	mux.HandleFunc("/chat/send", handlers.ChatSendHandler)
	mux.HandleFunc("/chat/clear", handlers.ChatClearHandler)

	log.Println("🚀 PurAI server running on http://localhost:8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
