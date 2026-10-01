let detector;
self.onmessage = async ({data}) => {
  if(data.type==='init') {
    try {
      const {HandLandmarker, FilesetResolver} = await import('./vendor/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm/',self.location.href).href);
      detector = await HandLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:new URL('./assets/hand_landmarker.task',self.location.href).href,delegate:'CPU'},
        runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6
      });
      self.postMessage({type:'ready'});
    } catch(error){self.postMessage({type:'error',message:error.message});}
  }
  if(data.type==='frame') {
    try {
      const result=detector.detectForVideo(data.bitmap,data.timestamp);
      self.postMessage({type:'result',landmarks:result.landmarks[0]||null});
    } catch(error){self.postMessage({type:'error',message:error.message});}
    finally{data.bitmap.close();}
  }
};
