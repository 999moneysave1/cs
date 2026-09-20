import React, { useState, useEffect, useRef } from 'react'
import Groq from 'groq-sdk'

// Environment variables से सुरक्षित API Keys
const GROQ_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY || ''
const TTS_API_BASE = process.env.NEXT_PUBLIC_TTS_API_BASE || 'https://my-tts-api-kebt.onrender.com'

export default function Home() {
  const [showInput, setShowInput] = useState(false)
  const [isVoicePaused, setIsVoicePaused] = useState(false)
  const [isManualLocked, setIsManualLocked] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [readMode, setReadMode] = useState('points') // 'points' | 'full'
  const [selectedVoice, setSelectedVoice] = useState('hi-IN-MadhurNeural')
  const [inputText, setInputText] = useState('')
  const [transcript, setTranscript] = useState('Listening live...')
  const [whisperText, setWhisperText] = useState('Ear whisper ready.')
  const [detailedAnswer, setDetailedAnswer] = useState('Answer will appear here...')
  const [bulletPoints, setBulletPoints] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeWordIndex, setActiveWordIndex] = useState(-1)

  const contentBoxRef = useRef(null)
  const audioPlayerRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const cooldownIntervalRef = useRef(null)
  const lastProcessedTextRef = useRef('')
  const isPausedRef = useRef(false)
  const readModeRef = useRef('points')
  const isManualLockedRef = useRef(false)
  const cooldownSecondsRef = useRef(0)
  const lastSpeechTextRef = useRef('')
  const selectedVoiceRef = useRef('hi-IN-MadhurNeural')

  const allWordsRef = useRef([])
  const currentWordIdxRef = useRef(0)
  const currentSectionsRef = useRef({ whisper: [], points: [], explanation: [] })

  useEffect(() => { isPausedRef.current = isVoicePaused }, [isVoicePaused])
  useEffect(() => { readModeRef.current = readMode }, [readMode])
  useEffect(() => { isManualLockedRef.current = isManualLocked }, [isManualLocked])
  useEffect(() => { cooldownSecondsRef.current = cooldownSeconds }, [cooldownSeconds])
  useEffect(() => { selectedVoiceRef.current = selectedVoice }, [selectedVoice])

  // बैकएंड को जगाना
  useEffect(() => {
    fetch(TTS_API_BASE).catch(() => {})
  }, [])

  // 1. न्यूरल ऑडियो प्लेयर (Render Neural API)
  const playNeuralAudio = (textToSpeak, startWordOffset = 0) => {
    if (!textToSpeak || isPausedRef.current) return
    lastSpeechTextRef.current = textToSpeak

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause()
      audioPlayerRef.current = null
    }

    const words = textToSpeak.split(/\s+/).filter(w => w.trim().length > 0)
    allWordsRef.current = words

    const cleanText = textToSpeak.replace(/_{2,}/g, ' dash ')
    const streamUrl = `${TTS_API_BASE}/speak?voice=${encodeURIComponent(selectedVoiceRef.current)}&text=${encodeURIComponent(cleanText)}`

    const player = new Audio(streamUrl)
    audioPlayerRef.current = player

    player.ontimeupdate = () => {
      if (!player || !player.duration || player.paused) return
      const progress = player.currentTime / player.duration
      const currentIdx = startWordOffset + Math.min(Math.floor(progress * words.length), words.length - 1)
      currentWordIdxRef.current = currentIdx
      setActiveWordIndex(currentIdx)
    }

    player.onended = () => setActiveWordIndex(-1)
    player.onerror = () => setActiveWordIndex(-1)

    player.play().catch(() => {})
  }

  // 2. पॉइंट स्किप / फ़ॉरवर्ड
  const skipToNextPoint = () => {
    const sections = currentSectionsRef.current
    const currentIdx = currentWordIdxRef.current

    let nextStartIdx = -1
    let whisperLen = sections.whisper.length

    if (currentIdx < whisperLen) {
      nextStartIdx = whisperLen
    } else {
      let accumulated = whisperLen
      for (let i = 0; i < sections.points.length; i++) {
        accumulated += sections.points[i].length
        if (accumulated > currentIdx + 1) {
          nextStartIdx = accumulated
          break
        }
      }
    }

    if (nextStartIdx === -1 && readModeRef.current === 'full' && sections.explanation.length > 0) {
      nextStartIdx = whisperLen + sections.points.reduce((acc, p) => acc + p.length, 0)
    }

    if (nextStartIdx !== -1 && nextStartIdx < allWordsRef.current.length) {
      const remainingWords = allWordsRef.current.slice(nextStartIdx)
      const remainingText = remainingWords.join(' ')
      currentWordIdxRef.current = nextStartIdx
      setActiveWordIndex(nextStartIdx)
      playNeuralAudio(remainingText, nextStartIdx)
    }
  }

  const playFromSpecificSection = (globalStartIndex) => {
    if (globalStartIndex >= 0 && globalStartIndex < allWordsRef.current.length) {
      const remainingWords = allWordsRef.current.slice(globalStartIndex)
      const remainingText = remainingWords.join(' ')
      currentWordIdxRef.current = globalStartIndex
      setActiveWordIndex(globalStartIndex)
      playNeuralAudio(remainingText, globalStartIndex)
    }
  }

  // 3. प्ले / पॉज़ टॉगल
  const togglePlayPauseAudio = () => {
    const nextPaused = !isVoicePaused
    setIsVoicePaused(nextPaused)
    isPausedRef.current = nextPaused

    if (nextPaused) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
      }
    } else {
      if (audioPlayerRef.current && audioPlayerRef.current.src) {
        audioPlayerRef.current.play().catch(() => {})
      } else if (lastSpeechTextRef.current) {
        playNeuralAudio(lastSpeechTextRef.current, currentWordIdxRef.current)
      }
    }
  }

  const toggleVoiceSelection = () => {
    const nextVoice = selectedVoice === 'hi-IN-MadhurNeural' ? 'hi-IN-SwaraNeural' : 'hi-IN-MadhurNeural'
    setSelectedVoice(nextVoice)
    selectedVoiceRef.current = nextVoice

    if (audioPlayerRef.current && !audioPlayerRef.current.paused && lastSpeechTextRef.current) {
      playNeuralAudio(lastSpeechTextRef.current, currentWordIdxRef.current)
    }
  }

  // 4. Groq AI Calling
  const askGroqAI = async (questionText) => {
    const cleanQ = questionText.trim()
    if (!cleanQ || cleanQ.length < 3 || cleanQ === lastProcessedTextRef.current) return

    lastProcessedTextRef.current = cleanQ
    setIsLoading(true)
    setWhisperText('Thinking...')
    setActiveWordIndex(-1)

    try {
      const groq = new Groq({
        apiKey: GROQ_API_KEY.trim(),
        dangerouslyAllowBrowser: true,
      })

      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content: `You are an elite interview co-pilot.
RULES:
1. TALK LIKE A REAL HUMAN: Simple, crisp, natural plain English. No long essays.
2. TECHNICAL CONTEXT: RAM and ROM are strictly computer memory (Random Access Memory vs Read-Only Memory).
3. FORMAT:
   - "whisper": 1 short punchy line to start speaking (max 8-10 words).
   - "points": Exactly 3 short, sharp points (15-20 words each).
   - "explanation": 2-3 short, clear sentences. Easy analogy without heavy theory.

JSON ONLY:
{
  "whisper": "...",
  "points": ["...", "...", "..."],
  "explanation": "..."
}`
          },
          {
            role: 'user',
            content: `Question: "${cleanQ}"`,
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      })

      const raw = completion.choices[0]?.message?.content || '{}'
      const res = JSON.parse(raw)
      const resPoints = Array.isArray(res.points) ? res.points : []
      const resExplanation = res.explanation || ''

      setWhisperText(res.whisper || '')
      setBulletPoints(resPoints)
      setDetailedAnswer(resExplanation)

      const whisperWords = (res.whisper || '').split(/\s+/).filter(w => w.trim().length > 0)
      const pointsWordArrays = resPoints.map(p => p.split(/\s+/).filter(w => w.trim().length > 0))
      const explanationWords = resExplanation.split(/\s+/).filter(w => w.trim().length > 0)

      currentSectionsRef.current = {
        whisper: whisperWords,
        points: pointsWordArrays,
        explanation: explanationWords
      }

      let textToSpeak = ''
      if (readModeRef.current === 'points') {
        textToSpeak = `${res.whisper}. ${resPoints.join('. ')}`
      } else {
        textToSpeak = `${res.whisper}. ${resPoints.join('. ')}. ${resExplanation}`
      }

      playNeuralAudio(textToSpeak, 0)

      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current)
      setCooldownSeconds(25)
      cooldownIntervalRef.current = setInterval(() => {
        setCooldownSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(cooldownIntervalRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)

    } catch (err) {
      setWhisperText(`Error: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // 5. स्पीच रिकग्निशन लिसनर (HTTPS Vercel पर डायरेक्ट)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      if (isManualLockedRef.current || cooldownSecondsRef.current > 0) return

      let liveText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        liveText += event.results[i][0].transcript
      }

      const cleanText = liveText.trim()
      if (cleanText) {
        setTranscript(cleanText)

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = setTimeout(() => {
          if (!isManualLockedRef.current && cooldownSecondsRef.current === 0) {
            if (cleanText.length >= 4 && cleanText !== lastProcessedTextRef.current) {
              askGroqAI(cleanText)
            }
          }
        }, 900)
      }
    }

    recognition.onend = () => { try { recognition.start() } catch (e) {} }
    recognition.onerror = () => { setTimeout(() => { try { recognition.start() } catch (e) {} }, 500) }

    const startSafely = () => { try { recognition.start() } catch (e) {} }
    startSafely()
    window.addEventListener('click', startSafely, { once: true })
  }, [])

  const handleOverrideToggle = () => {
    let newLock = !isManualLocked
    if (cooldownSeconds > 0) {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current)
      setCooldownSeconds(0)
      newLock = false
    }
    setIsManualLocked(newLock)
  }

  useEffect(() => {
    const handleGlobalKey = (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : ''
      const isTyping = activeTag === 'input' || activeTag === 'textarea'

      if (e.altKey && e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault()
        skipToNextPoint()
        return
      }

      if ((e.code === 'Space' && !isTyping) || (e.altKey && e.key.toLowerCase() === 'm')) {
        e.preventDefault()
        handleOverrideToggle()
        return
      }
    }

    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [cooldownSeconds, isManualLocked])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputText.trim()) {
        const q = inputText.trim()
        setTranscript(q)
        setInputText('')
        askGroqAI(q)
      }
    }
  }

  const whisperWords = (whisperText || '').split(/\s+/).filter(w => w.trim().length > 0)
  let wordOffsetCounter = whisperWords.length

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-900 p-4">
      <div className="flex flex-col h-[600px] w-[420px] select-none bg-slate-950 text-slate-100 rounded-xl border border-slate-800/80 shadow-2xl overflow-hidden font-sans relative">
        {/* हेडर */}
        <div className="h-7 bg-slate-900/95 px-2.5 flex items-center justify-between border-b border-slate-800/70">
          <div className="flex items-center space-x-1.5">
            <div className={`w-2 h-2 rounded-full ${
              isManualLocked ? 'bg-rose-500' :
              cooldownSeconds > 0 ? 'bg-amber-400 animate-pulse' :
              isLoading ? 'bg-indigo-400 animate-ping' :
              'bg-emerald-400'
            }`} />
            <span className="text-[10px] font-mono text-slate-400">
              {isManualLocked ? 'Locked' :
               cooldownSeconds > 0 ? `${cooldownSeconds}s` :
               isLoading ? 'Thinking...' : 'Live'}
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={skipToNextPoint}
              className="text-xs px-1.5 py-0.5 rounded font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
              title="Skip / Forward to next point (Alt+Shift+Right)"
            >
              ⏩ Next
            </button>

            <button
              onClick={handleOverrideToggle}
              className={`text-xs px-1.5 py-0.5 rounded font-mono transition flex items-center space-x-0.5 ${
                cooldownSeconds > 0
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : isManualLocked
                  ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                  : 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
              }`}
              title="Toggle Lock (Space / Alt+M)"
            >
              <span>{isManualLocked ? '🔒' : '🔓'}</span>
              {cooldownSeconds > 0 && <span className="text-[10px] font-mono">{cooldownSeconds}s</span>}
            </button>

            <button
              onClick={toggleVoiceSelection}
              className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30"
              title="Switch Voice"
            >
              {selectedVoice.includes('Madhur') ? '🎙️ Madhur' : '🎙️ Swara'}
            </button>

            <button
              onClick={() => setReadMode(readMode === 'points' ? 'full' : 'points')}
              className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
              title="Toggle Reading Mode"
            >
              {readMode === 'points' ? '📖 Points' : '📖 Full'}
            </button>

            <button
              onClick={togglePlayPauseAudio}
              className={`text-xs px-1.5 py-0.5 rounded font-mono transition ${
                isVoicePaused
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title={isVoicePaused ? 'Play Audio' : 'Pause Audio'}
            >
              {isVoicePaused ? '▶' : '⏸'}
            </button>

            <button
              onClick={() => setShowInput(!showInput)}
              className="text-slate-400 hover:text-white text-xs px-1 py-0.5 rounded hover:bg-slate-800 font-mono"
              title="Toggle Input Box"
            >
              {showInput ? '−' : '+'}
            </button>
          </div>
        </div>

        {/* मुख्य बॉडी */}
        <div className="flex-1 p-2 overflow-hidden flex flex-col space-y-1.5">
          {/* 🎧 व्हिस्पर बार */}
          <div
            onClick={() => playFromSpecificSection(0)}
            className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1 flex items-start space-x-1.5 cursor-pointer hover:bg-amber-500/15 transition"
            title="Click to replay from start"
          >
            <span className="text-xs pt-0.5">🎧</span>
            <p className="text-xs leading-relaxed font-medium flex-1">
              {whisperWords.map((word, i) => (
                <span
                  key={i}
                  className={`transition-colors duration-150 mr-1 inline-block ${
                    i === activeWordIndex
                      ? 'text-amber-300 font-bold bg-amber-400/25 px-1 rounded shadow-sm'
                      : 'text-amber-200/90'
                  }`}
                >
                  {word}
                </span>
              ))}
            </p>
          </div>

          {/* उत्तर बॉक्स */}
          <div
            ref={contentBoxRef}
            className="flex-1 bg-slate-900/40 border border-slate-800/80 rounded-lg p-2 overflow-y-auto select-text font-mono text-xs space-y-1.5"
          >
            {bulletPoints.length > 0 && (
              <div className="space-y-1">
                {bulletPoints.map((pt, idx) => {
                  const ptWords = pt.split(/\s+/).filter(w => w.trim().length > 0)
                  const thisPtStartIdx = wordOffsetCounter
                  wordOffsetCounter += ptWords.length

                  return (
                    <div
                      key={idx}
                      onClick={() => playFromSpecificSection(thisPtStartIdx)}
                      className="flex items-start space-x-1.5 cursor-pointer hover:bg-slate-800/30 p-0.5 rounded transition"
                      title="Click point to listen from here"
                    >
                      <span className="text-emerald-400 font-bold">•</span>
                      <span className="leading-relaxed flex-1">
                        {ptWords.map((w, wIdx) => {
                          const globalWordIdx = thisPtStartIdx + wIdx
                          const isSpeaking = globalWordIdx === activeWordIndex
                          return (
                            <span
                              key={wIdx}
                              className={`mr-1 inline-block transition-colors duration-150 ${
                                isSpeaking
                                  ? 'text-amber-300 font-bold bg-amber-400/25 px-1 rounded shadow-sm'
                                  : (idx % 2 === 0 ? 'text-emerald-300 font-medium' : 'text-slate-100')
                              }`}
                            >
                              {w}
                            </span>
                          )
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {detailedAnswer && (
              <div
                onClick={() => playFromSpecificSection(wordOffsetCounter)}
                className="text-slate-300 pt-1 border-t border-slate-800/60 leading-relaxed whitespace-pre-wrap cursor-pointer hover:bg-slate-800/30 p-0.5 rounded transition"
                title="Click explanation to listen from here"
              >
                {detailedAnswer.split(/\s+/).filter(w => w.trim().length > 0).map((w, wIdx) => {
                  const globalWordIdx = wordOffsetCounter + wIdx
                  const isSpeaking = globalWordIdx === activeWordIndex
                  return (
                    <span
                      key={wIdx}
                      className={`mr-1 inline-block transition-colors duration-150 ${
                        isSpeaking
                          ? 'text-amber-300 font-bold bg-amber-400/25 px-1 rounded shadow-sm'
                          : 'text-slate-300'
                      }`}
                    >
                      {w}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* इनपुट बॉक्स */}
          {showInput && (
            <div className="space-y-1">
              <textarea
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste question or code & Enter..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500 font-mono resize-none"
              />
            </div>
          )}

          {/* प्रश्न बार */}
          <div className="bg-slate-900/50 border border-slate-800/60 rounded-lg px-2.5 py-0.5 flex items-center space-x-1.5 text-[11px]">
            <span className="font-bold text-indigo-400 font-mono">Q:</span>
            <p className="text-slate-300 italic truncate flex-1">
              {transcript}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
