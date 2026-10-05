"use client"

import { useState, useRef, useEffect } from "react"
import { MessageCircle, X, Send, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Message = {
  role: "user" | "assistant"
  content: string
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "¡Hola! Soy Rocío. ¿En qué te puedo ayudar hoy?" }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isOpen])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const newMessages = [...messages, { role: "user" as const, content: input }]
    setMessages(newMessages)
    setInput("")
    setIsLoading(true)

    try {
      const res = await fetch("/api/conserje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()
      
      if (data.content) {
        setMessages(prev => [...prev, { role: "assistant", content: data.content }])
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Lo siento, tuve un problema al procesar tu solicitud." }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Error de conexión." }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full flex items-center justify-center shadow-lg shadow-primary/30 transition-all hover:scale-105 z-50 ring-4 ring-background"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-80 sm:w-[350px] h-[500px] max-h-[80vh] bg-background rounded-2xl shadow-2xl border border-border/60 flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-white/20 rounded-full flex items-center justify-center shadow-inner">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm tracking-tight">Rocío</h3>
                <p className="text-[11px] font-medium text-primary-foreground/80">Conserje Inteligente</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-primary-foreground/70 hover:text-primary-foreground transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                  m.role === "user" 
                    ? "bg-primary text-primary-foreground rounded-br-none" 
                    : "bg-card text-card-foreground border border-border/50 rounded-bl-none"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-card border border-border/50 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce delay-150" />
                  <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce delay-300" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-card border-t border-border/60">
            <form onSubmit={sendMessage} className="flex items-center gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Pregunta a Rocío..."
                className="flex-1 rounded-full border-border/50 bg-muted/50 px-4 focus-visible:bg-background focus-visible:ring-primary/20 shadow-inner"
              />
              <Button type="submit" disabled={!input.trim() || isLoading} size="icon" className="h-10 w-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-sm transition-transform active:scale-95">
                <Send className="h-4 w-4 ml-0.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
