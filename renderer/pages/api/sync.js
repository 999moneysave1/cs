// renderer/pages/api/sync.js
let bridgeState = {
  transcript: '',
  whisperText: '',
  detailedAnswer: '',
  isLoading: false,
  timestamp: 0,
}

export default function handler(req, res) {
  if (req.method === 'POST') {
    bridgeState = {
      ...bridgeState,
      ...req.body,
      timestamp: Date.now(),
    }
    return res.status(200).json({ success: true, data: bridgeState })
  }
  return res.status(200).json(bridgeState)
}