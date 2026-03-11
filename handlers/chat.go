package handlers

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const apiURL = "https://www.puruboy.kozow.com/api/ai/notegpt"

var templates = template.Must(template.ParseGlob("templates/*.html"))

// IndexHandler serves the main chat page
func IndexHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html")
	if err := templates.ExecuteTemplate(w, "index.html", nil); err != nil {
		log.Println("template error:", err)
		http.Error(w, "template error", 500)
	}
}

// ChatClearHandler returns an empty chat area
func ChatClearHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, ``)
}

// ChatSendHandler handles streaming SSE response proxied from PurAI API
func ChatSendHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}

	prompt := strings.TrimSpace(r.FormValue("message"))
	model := r.FormValue("model")
	if model == "" {
		model = "gemini-3-flash-preview"
	}
	if prompt == "" {
		http.Error(w, "empty message", 400)
		return
	}

	now := time.Now().Format("15:04")

	// --- SSE setup ---
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", 500)
		return
	}

	// Send user bubble first
	userBubble := fmt.Sprintf(`<div id="msg-user-%s" class="bubble-wrap user-wrap">
  <div class="bubble user-bubble">%s</div>
  <span class="ts">%s</span>
</div>`, now, template.HTMLEscapeString(prompt), now)

	fmt.Fprintf(w, "event: user\ndata: %s\n\n", jsonEscape(userBubble))
	flusher.Flush()

	// Open AI bubble shell (will be filled via token events)
	aiBubbleOpen := fmt.Sprintf(`<div id="msg-ai-%s" class="bubble-wrap ai-wrap">
  <div class="ai-avatar"><span>P</span></div>
  <div class="bubble ai-bubble" id="ai-content-%s"><span class="cursor-blink">▋</span></div>
  <span class="ts">%s</span>
</div>`, now, now, now)

	fmt.Fprintf(w, "event: ai_open\ndata: %s\n\n", jsonEscape(aiBubbleOpen))
	flusher.Flush()

	// Call upstream API
	payload, _ := json.Marshal(map[string]string{
		"prompt":    prompt,
		"model":     model,
		"chat_mode": "standard",
	})

	resp, err := http.Post(apiURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		errMsg := `<div class="bubble ai-bubble error-bubble">⚠️ Gagal terhubung ke server AI.</div>`
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", jsonEscape(errMsg))
		flusher.Flush()
		return
	}
	defer resp.Body.Close()

	// Stream tokens
	scanner := bufio.NewScanner(resp.Body)
	var fullText strings.Builder

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		raw := strings.TrimPrefix(line, "data: ")

		var chunk struct {
			Text string `json:"text"`
			Done bool   `json:"done"`
			Type string `json:"type"`
		}
		if err := json.Unmarshal([]byte(raw), &chunk); err != nil {
			continue
		}
		if chunk.Type == "finish" {
			break
		}
		if chunk.Done {
			// Send done signal
			fmt.Fprintf(w, "event: done\ndata: %s\n\n", jsonEscape(now))
			flusher.Flush()
			break
		}
		if chunk.Text == "" {
			continue
		}

		fullText.WriteString(chunk.Text)
		// Send incremental token
		fmt.Fprintf(w, "event: token\ndata: %s\n\n", jsonEscape(chunk.Text))
		flusher.Flush()
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		log.Println("scanner error:", err)
	}
}

func jsonEscape(s string) string {
	b, _ := json.Marshal(s)
	// strip surrounding quotes
	return string(b[1 : len(b)-1])
}
