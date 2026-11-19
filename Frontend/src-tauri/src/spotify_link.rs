//! Enlaces de Spotify -> lo que dicen del contenido (título, artistas), sin cuenta ni API de Spotify.
//!
//! Se lee la página "embed" pública (`open.spotify.com/embed/<tipo>/<id>`), que lleva sus datos en un JSON
//! (`__NEXT_DATA__`). El cliente luego busca ese contenido en YouTube Music con los métodos de búsqueda de la app.
//! Referencia: spotify.rs de limusic (GPL-3.0, solo como guía de la forma de los datos).

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
// Como limusic: la página pública de Spotify deja leer como mucho las primeras 100 pistas de una lista.
const MAX_PLAYLIST_TRACKS: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LinkKind {
    Track,
    Album,
    Artist,
    Playlist,
}

impl LinkKind {
    fn path(self) -> &'static str {
        match self {
            LinkKind::Track => "track",
            LinkKind::Album => "album",
            LinkKind::Artist => "artist",
            LinkKind::Playlist => "playlist",
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SpotifyTrack {
    pub title: String,
    pub artists: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SpotifyLink {
    pub kind: LinkKind,
    pub name: String,
    /// Álbum: el artista; playlist: su autor.
    pub owner: Option<String>,
    /// Pista: sus artistas; lista o álbum: las primeras pistas.
    pub tracks: Vec<SpotifyTrack>,
    /// Portada de la lista o álbum (la imagen pública de Spotify), si la página la trae.
    pub cover: Option<String>,
    /// La lista llegó al máximo que se puede leer: puede tener más canciones de las que se ven.
    pub truncated: bool,
}

/// `None` si no es un enlace de Spotify de pista, álbum, artista o playlist. Acepta lo que se pega de verdad:
/// `open.spotify.com/track/<id>?si=…`, las formas `/intl-xx/` y `/embed/`, sin esquema y `spotify:track:<id>`.
pub fn parse_link(input: &str) -> Option<(LinkKind, String)> {
    let text = input.trim();
    let segments: Vec<String> = if let Some(rest) = text.strip_prefix("spotify:") {
        rest.split(':').map(str::to_owned).collect()
    } else {
        let with_scheme = if text.contains("://") { text.to_owned() } else { format!("https://{text}") };
        let url = reqwest::Url::parse(&with_scheme).ok()?;
        if !matches!(url.host_str()?, "open.spotify.com" | "play.spotify.com") {
            return None;
        }
        url.path_segments()?.filter(|s| !s.is_empty()).map(str::to_owned).collect()
    };
    // El tipo es la primera palabra conocida y el id el segmento siguiente: así se saltan `intl-xx`, `embed` y `user/<nombre>`.
    segments.windows(2).find_map(|pair| {
        let kind = match pair[0].as_str() {
            "track" => LinkKind::Track,
            "album" => LinkKind::Album,
            "artist" => LinkKind::Artist,
            "playlist" => LinkKind::Playlist,
            _ => return None,
        };
        let id = pair[1].as_str();
        (!id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric()))
            .then(|| (kind, id.to_owned()))
    })
}

fn next_data(html: &str) -> Option<Value> {
    const OPEN: &str = r#"<script id="__NEXT_DATA__" type="application/json">"#;
    let start = html.find(OPEN)? + OPEN.len();
    let end = start + html[start..].find("</script>")?;
    serde_json::from_str(&html[start..end]).ok()
}

fn text_at<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}

fn split_artists(line: &str) -> Vec<String> {
    line.split(", ").map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned).collect()
}

/// Convierte el `entity` del embed en lo que necesita el cliente. Errores como códigos cortos: `private`, `spotify_changed`.
pub fn parse_embed(kind: LinkKind, html: &str) -> Result<SpotifyLink, String> {
    let data = next_data(html).ok_or("spotify_changed")?;
    if data.pointer("/props/pageProps/status").and_then(Value::as_u64) == Some(404) {
        return Err("private".into());
    }
    let entity = data.pointer("/props/pageProps/state/data/entity").ok_or("private")?;
    let name = text_at(entity, "name").or_else(|| text_at(entity, "title")).ok_or("spotify_changed")?.to_owned();

    match kind {
        LinkKind::Track => {
            let artists: Vec<String> = entity
                .get("artists")
                .and_then(Value::as_array)
                .map(|list| list.iter().filter_map(|a| text_at(a, "name")).map(str::to_owned).collect())
                .unwrap_or_default();
            Ok(SpotifyLink { kind, name: name.clone(), owner: None, tracks: vec![SpotifyTrack { title: name, artists }], cover: None, truncated: false })
        }
        LinkKind::Artist => Ok(SpotifyLink { kind, name, owner: None, tracks: Vec::new(), cover: None, truncated: false }),
        LinkKind::Album | LinkKind::Playlist => {
            let owner = text_at(entity, "subtitle").map(str::to_owned);
            let cover = entity
                .pointer("/coverArt/sources/0/url")
                .and_then(Value::as_str)
                .filter(|url| url.starts_with("https://"))
                .map(str::to_owned);
            let tracks: Vec<SpotifyTrack> = entity
                .get("trackList")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default()
                .iter()
                .filter(|t| t.get("entityType").and_then(Value::as_str).unwrap_or("track") == "track")
                .filter_map(|t| {
                    Some(SpotifyTrack {
                        title: text_at(t, "title")?.to_owned(),
                        artists: text_at(t, "subtitle").map(split_artists).unwrap_or_default(),
                    })
                })
                .take(MAX_PLAYLIST_TRACKS)
                .collect();
            let truncated = tracks.len() >= MAX_PLAYLIST_TRACKS;
            Ok(SpotifyLink { kind, name, owner, tracks, cover, truncated })
        }
    }
}

async fn fetch_embed(kind: LinkKind, id: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent(WEB_UA)
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(format!("https://open.spotify.com/embed/{}/{id}", kind.path()))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    // Una playlist privada o borrada es un 404, igual que un id mal escrito.
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("private".into());
    }
    response.error_for_status().map_err(|error| error.to_string())?.text().await.map_err(|error| error.to_string())
}

/// Lee un enlace de Spotify y devuelve su título y artistas para buscarlos en YouTube Music.
#[tauri::command]
pub async fn spotify_link_info(link: String) -> Result<SpotifyLink, String> {
    let (kind, id) = parse_link(&link).ok_or("not_spotify")?;
    let html = fetch_embed(kind, &id).await?;
    parse_embed(kind, &html)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_links_people_paste() {
        for (input, kind, id) in [
            ("https://open.spotify.com/track/05RgAMGypEvqhNs5hPCbMS?si=abc", LinkKind::Track, "05RgAMGypEvqhNs5hPCbMS"),
            ("open.spotify.com/intl-es/album/4aawyAB9vmqN3uQ7FjRGTy", LinkKind::Album, "4aawyAB9vmqN3uQ7FjRGTy"),
            ("https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M", LinkKind::Playlist, "37i9dQZF1DXcBWIGoYBM5M"),
            ("https://open.spotify.com/user/someone/playlist/abc123", LinkKind::Playlist, "abc123"),
            ("spotify:artist:0TnOYISbd1XYRBk9myaseg", LinkKind::Artist, "0TnOYISbd1XYRBk9myaseg"),
        ] {
            assert_eq!(parse_link(input), Some((kind, id.to_owned())), "{input}");
        }
    }

    #[test]
    fn rejects_everything_else() {
        for input in [
            "https://music.youtube.com/playlist?list=PL123",
            "https://open.spotify.com/show/abc",
            "https://open.spotify.com/playlist/",
            "not a link",
            "",
        ] {
            assert_eq!(parse_link(input), None, "{input}");
        }
    }

    fn page(entity: &str) -> String {
        format!(
            r#"<html><script id="__NEXT_DATA__" type="application/json">{{"props":{{"pageProps":{{"state":{{"data":{{"entity":{entity}}}}}}}}}}}</script></html>"#
        )
    }

    #[test]
    fn reads_a_track_and_its_artists() {
        let html = page(r#"{"name":"Tomorrow","artists":[{"name":"Kali Uchis"},{"name":"Other"}]}"#);
        let link = parse_embed(LinkKind::Track, &html).unwrap();
        assert_eq!(link.name, "Tomorrow");
        assert_eq!(link.tracks, vec![SpotifyTrack { title: "Tomorrow".into(), artists: vec!["Kali Uchis".into(), "Other".into()] }]);
    }

    #[test]
    fn reads_a_playlist_track_list_and_skips_episodes() {
        let html = page(
            r#"{"name":"Mix","subtitle":"Yo","trackList":[
                {"title":"A","subtitle":"X, Y","entityType":"track"},
                {"title":"Ep","subtitle":"Pod","entityType":"episode"},
                {"title":"B","subtitle":"Z"}]}"#,
        );
        let link = parse_embed(LinkKind::Playlist, &html).unwrap();
        assert_eq!(link.owner.as_deref(), Some("Yo"));
        assert_eq!(link.tracks.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), vec!["A", "B"]);
        assert_eq!(link.tracks[0].artists, vec!["X", "Y"]);
    }

    #[test]
    fn reads_more_than_25_tracks_the_cover_and_flags_a_cut_list() {
        let list = |count: usize| {
            let rows: Vec<String> = (0..count).map(|n| format!(r#"{{"title":"T{n}","subtitle":"A"}}"#)).collect();
            page(&format!(
                r#"{{"name":"Larga","subtitle":"Yo","coverArt":{{"sources":[{{"url":"https://i.scdn.co/image/abc"}}]}},"trackList":[{}]}}"#,
                rows.join(",")
            ))
        };
        let medium = parse_embed(LinkKind::Playlist, &list(50)).unwrap();
        assert_eq!(medium.tracks.len(), 50, "ya no se recorta a 25");
        assert_eq!(medium.cover.as_deref(), Some("https://i.scdn.co/image/abc"));
        assert!(!medium.truncated);
        let long = parse_embed(LinkKind::Playlist, &list(140)).unwrap();
        assert_eq!(long.tracks.len(), 100, "el máximo que deja leer Spotify");
        assert!(long.truncated);
        // Sin portada, o con una dirección que no es https, no hay portada.
        let bare = parse_embed(LinkKind::Playlist, &page(r#"{"name":"M","trackList":[]}"#)).unwrap();
        assert_eq!(bare.cover, None);
    }

    #[test]
    fn a_missing_entity_is_private_and_garbage_is_a_changed_page() {
        let gone = r#"<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"status":404}}}</script>"#;
        assert_eq!(parse_embed(LinkKind::Track, gone), Err("private".to_string()));
        assert_eq!(parse_embed(LinkKind::Track, "<html></html>"), Err("spotify_changed".to_string()));
    }
}
