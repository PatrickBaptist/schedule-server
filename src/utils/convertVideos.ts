function convertToEmbedUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    let videoId: string | null = null;

    if (parsedUrl.hostname === 'youtu.be') {
      videoId = parsedUrl.pathname.substring(1);
    } else if (
      parsedUrl.hostname === 'www.youtube.com' ||
      parsedUrl.hostname === 'youtube.com'
    ) {
      videoId = parsedUrl.searchParams.get('v');

      if (!videoId && parsedUrl.pathname.startsWith('/embed/')) {
        videoId = parsedUrl.pathname.split('/embed/')[1];
      }
    }

    if (videoId) {
      console.log(`Vídeo convertido para embed com sucesso`);
      return `https://www.youtube.com/embed/${videoId}`;
    }

    return null;
  } catch (error) {
    console.error('Erro ao converter URL:', error);
    return null;
  }
}

export default convertToEmbedUrl;