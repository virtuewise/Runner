import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { RunnerOfferInboxItem } from "../../domain/mission/network-operations-queries.ts";

const C={bg:"#090B0E",surface:"#11151A",raised:"#171D24",border:"#252D36",text:"#F4F6F8",muted:"#929DA8",orange:"#FF6A2A",green:"#8DD7B0"};
function addressLabel(value:Readonly<Record<string,unknown>>):string{
  const locality=typeof value.locality==="string"?value.locality:"";
  const address=typeof value.addressLine==="string"?value.addressLine:"";
  const country=typeof value.countryCode==="string"?value.countryCode:"";
  return [locality,address,country].filter(Boolean).join(" · ")||"Location details pending";
}
function timeLabel(value:string|null):string{
  if(!value)return "Time window pending";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"Time window pending":date.toLocaleString();
}
export interface RunnerOfferInboxProps{
  readonly offers:readonly RunnerOfferInboxItem[];
  readonly loading:boolean;
  readonly error?:string|null;
  readonly respondingOfferId?:string|null;
  readonly onAccept:(offerId:string)=>void;
  readonly onDecline:(offerId:string)=>void;
}
export function RunnerOfferInbox(props:RunnerOfferInboxProps){
  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>RUNNER NETWORK / MISSIONS</Text>
      <Text style={styles.title}>OFFER INBOX</Text>
      <Text style={styles.subtitle}>Every mission has a destination. Review the handoff, then decide whether you can take it on.</Text>
    </View>
    {props.loading?<View style={styles.empty}><ActivityIndicator color={C.orange}/><Text style={styles.muted}>Loading your offers…</Text></View>:null}
    {props.error?<View style={styles.error}><Text style={styles.errorText}>{props.error}</Text></View>:null}
    {!props.loading&&!props.error&&props.offers.length===0?<View style={styles.empty}>
      <Text style={styles.emptyTitle}>NO ACTIVE OFFERS</Text>
      <Text style={styles.muted}>New missions will appear here when dispatch finds a suitable match.</Text>
    </View>:null}
    {props.offers.map(offer=>{
      const busy=props.respondingOfferId===offer.offerId;
      return <View key={offer.offerId} style={styles.card}>
        <View style={styles.cardTop}><Text style={styles.category}>{offer.missionCategory.replaceAll("_"," ").toUpperCase()}</Text><Text style={styles.expiry}>OFFERED · EXPIRES {new Date(offer.expiresAt).toLocaleTimeString()}</Text></View>
        <Text style={styles.routeTitle}>MISSION / LEG {offer.legNumber}</Text>
        <View style={styles.route}>
          <View style={styles.rail}><View style={styles.dot}/><View style={styles.line}/><View style={[styles.dot,styles.dotEnd]}/></View>
          <View style={styles.locations}>
            <Text style={styles.locationLabel}>PICKUP</Text><Text style={styles.location}>{addressLabel(offer.pickup)}</Text>
            <Text style={[styles.locationLabel,{marginTop:15}]}>DESTINATION</Text><Text style={styles.location}>{addressLabel(offer.destination)}</Text>
          </View>
        </View>
        <View style={styles.window}><Text style={styles.windowLabel}>SERVICE WINDOW</Text><Text style={styles.windowValue}>{timeLabel(offer.serviceWindowStart)} – {timeLabel(offer.serviceWindowEnd)}</Text></View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Accept mission offer ${offer.offerId}`} disabled={!!props.respondingOfferId} onPress={()=>props.onAccept(offer.offerId)} style={[styles.accept,!!props.respondingOfferId&&styles.disabled]}>
            {busy?<ActivityIndicator color="#111"/>:<Text style={styles.acceptText}>ACCEPT MISSION</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Decline mission offer ${offer.offerId}`} disabled={!!props.respondingOfferId} onPress={()=>props.onDecline(offer.offerId)} style={[styles.decline,!!props.respondingOfferId&&styles.disabled]}>
            <Text style={styles.declineText}>DECLINE</Text>
          </Pressable>
        </View>
      </View>;
    })}
  </ScrollView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:C.bg},content:{padding:20,gap:14,maxWidth:760,width:"100%",alignSelf:"center",paddingBottom:40},
 header:{paddingTop:20,paddingBottom:14,borderBottomWidth:1,borderBottomColor:C.border,marginBottom:4},
 eyebrow:{color:C.orange,fontSize:10,fontWeight:"900",letterSpacing:2},title:{color:C.text,fontSize:32,fontWeight:"900",letterSpacing:-1,marginTop:8},
 subtitle:{color:C.muted,fontSize:14,lineHeight:21,marginTop:8,maxWidth:540},
 card:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:5,padding:17,gap:14},
 cardTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8},
 category:{color:C.orange,fontSize:9,fontWeight:"900",letterSpacing:1.2},expiry:{color:C.muted,fontSize:9,fontWeight:"700"},
 routeTitle:{color:C.text,fontSize:17,fontWeight:"900",letterSpacing:.3},route:{flexDirection:"row",gap:14},
 rail:{width:12,alignItems:"center",paddingTop:5},dot:{width:9,height:9,borderRadius:5,borderWidth:2,borderColor:C.orange},dotEnd:{borderColor:C.green},
 line:{width:1,height:38,backgroundColor:C.border},locations:{flex:1},locationLabel:{color:C.muted,fontSize:8,fontWeight:"900",letterSpacing:1.2},
 location:{color:C.text,fontSize:13,fontWeight:"600",marginTop:4,lineHeight:19},
 window:{backgroundColor:C.raised,padding:11,borderRadius:3},windowLabel:{color:C.muted,fontSize:8,fontWeight:"900",letterSpacing:1.2},
 windowValue:{color:C.text,fontSize:11,marginTop:5,lineHeight:17},actions:{flexDirection:"row",gap:9},
 accept:{flex:1,backgroundColor:C.orange,minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:3},
 acceptText:{color:"#111",fontSize:10,fontWeight:"900",letterSpacing:1},decline:{minWidth:100,minHeight:44,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border,borderRadius:3},
 declineText:{color:C.text,fontSize:10,fontWeight:"800",letterSpacing:1},disabled:{opacity:.45},
 empty:{padding:28,alignItems:"center",gap:9,borderWidth:1,borderColor:C.border,backgroundColor:C.surface,borderRadius:4},
 emptyTitle:{color:C.text,fontSize:13,fontWeight:"900",letterSpacing:1.2},muted:{color:C.muted,fontSize:12,lineHeight:18,textAlign:"center"},
 error:{padding:14,borderWidth:1,borderColor:"#8A3B2A",backgroundColor:"#251713"},errorText:{color:"#FFB09A",fontSize:12},
});
